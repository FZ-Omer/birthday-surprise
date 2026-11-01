// Encrypts private/ into vault/ so the public repo only ever holds ciphertext.
// Usage (from this folder): node seal.mjs
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { extname } from 'node:path';
import vm from 'node:vm';

const ITERATIONS = 600000;
const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4' };
const { subtle } = globalThis.crypto;

const sandbox = { window: {} };
vm.runInNewContext(readFileSync('private/config.js', 'utf8'), sandbox);
const C = sandbox.window.CONFIG;

function ask(q) {
  return new Promise(res => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl.question(q, a => { rl.close(); process.stdout.write('\n'); res(a); });
    rl._writeToOutput = () => {}; // hide what is typed
  });
}
// must match normalize() in app.js
const normalize = s => s.normalize('NFC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

let answer = process.env.SEAL_ANSWER;
if (!answer) {
  answer = await ask(`${C.lock.question}\nAnswer (hidden): `);
  if (normalize(await ask('Type it again: ')) !== normalize(answer)) { console.error('Answers did not match.'); process.exit(1); }
}
if (normalize(answer).length < 4) { console.error('Answer is too short to be safe.'); process.exit(1); }

const salt = crypto.getRandomValues(new Uint8Array(16));
const base = await subtle.importKey('raw', new TextEncoder().encode(normalize(answer)), 'PBKDF2', false, ['deriveKey']);
const key = await subtle.deriveKey({ name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
  base, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
async function seal(bytes) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes));
  return Buffer.concat([iv, ct]);
}

rmSync('vault', { recursive: true, force: true });
mkdirSync('vault');
const sealed = new Map(); // private path -> vault path, so a photo used twice is stored once
async function sealFile(path) {
  if (!sealed.has(path)) {
    let bytes;
    try { bytes = readFileSync(`private/${path}`); } catch { console.warn(`Missing private/${path}, skipped.`); return ''; }
    const out = `vault/${sealed.size}.bin`;
    writeFileSync(out, await seal(bytes));
    sealed.set(path, out);
  }
  return sealed.get(path);
}

for (const item of [...C.memories, ...C.gallery]) {
  item.type = MIME[extname(item.src).toLowerCase()] || 'image/jpeg';
  item.src = await sealFile(item.src);
}
if (C.music) {
  C.musicType = MIME[extname(C.music).toLowerCase()] || 'audio/mpeg';
  C.music = await sealFile(C.music);
}

const { lock, ...secret } = C;
writeFileSync('vault/config.bin', await seal(new TextEncoder().encode(JSON.stringify(secret))));
writeFileSync('vault/lock.json', JSON.stringify({ ...lock, salt: Buffer.from(salt).toString('base64'), iterations: ITERATIONS }));
console.log(`Sealed ${sealed.size} files + config into vault/.`);
