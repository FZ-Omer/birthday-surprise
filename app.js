import * as THREE from 'three';
import { normalize } from './answer.js';

const $ = s => document.querySelector(s);
const rand = (a, b) => a + Math.random() * (b - a);
const wait = ms => new Promise(r => setTimeout(r, ms));
const isMobile = matchMedia('(max-width: 760px)').matches;
const BLOW_THRESHOLD = 0.15; // mic loudness (0–1) that counts as a blow; raise if candles go out on their own
gsap.registerPlugin(ScrollTrigger);

/* ---------- lock screen: everything personal is AES-encrypted in vault/ (see seal.mjs) ---------- */
async function openFile(path, key) {
  const buf = new Uint8Array(await (await fetch(path)).arrayBuffer());
  return crypto.subtle.decrypt({ name: 'AES-GCM', iv: buf.slice(0, 12) }, key, buf.slice(12));
}
// twinkling stars, a shooting star now and then, and floating hearts behind the lock card; stops once #lock is removed
function lockAmbience() {
  const cv = $('#lockStars'), ctx = cv.getContext('2d'), dpr = Math.min(devicePixelRatio, 2);
  const size = () => { cv.width = innerWidth * dpr; cv.height = innerHeight * dpr; };
  size();
  addEventListener('resize', size);
  const stars = Array.from({ length: 160 }, () => ({ x: Math.random(), y: Math.random(), r: rand(0.3, 1.4), p: rand(0, 6) }));
  let shoot = null;
  (function draw(t) {
    if (!cv.isConnected) return removeEventListener('resize', size);
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.fillStyle = '#fff';
    for (const s of stars) {
      ctx.globalAlpha = 0.3 + 0.7 * Math.abs(Math.sin(t / 900 + s.p));
      ctx.beginPath();
      ctx.arc(s.x * cv.width, s.y * cv.height, s.r * dpr, 0, 7);
      ctx.fill();
    }
    if (!shoot && Math.random() < 0.006) shoot = { x: rand(0.1, 0.8) * cv.width, y: rand(0, 0.4) * cv.height, life: 1 };
    if (shoot) {
      const k = 1 - shoot.life, x = shoot.x + k * 420 * dpr, y = shoot.y + k * 210 * dpr, len = 150 * dpr;
      const g = ctx.createLinearGradient(x, y, x - len, y - len / 2);
      g.addColorStop(0, '#fff');
      g.addColorStop(1, 'transparent');
      ctx.globalAlpha = shoot.life;
      ctx.strokeStyle = g;
      ctx.lineWidth = 1.5 * dpr;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - len, y - len / 2);
      ctx.stroke();
      if ((shoot.life -= 0.02) <= 0) shoot = null;
    }
    requestAnimationFrame(draw);
  })(0);
  for (let i = 0; i < 16; i++) {
    const f = document.createElement('span');
    f.className = 'floater';
    f.textContent = ['💖', '✨', '💗', '🌸', '💫', '🎈'][i % 6];
    f.style.cssText = `left:${rand(0, 95)}%;font-size:${rand(14, 28)}px;animation-duration:${rand(9, 18)}s;animation-delay:${-rand(0, 18)}s;--dx:${rand(-60, 60)}px;--r:${rand(-40, 40)}deg`;
    $('#lock').insertBefore(f, $('#lockForm'));
  }
}

async function unlock() {
  lockAmbience();
  const lock = await (await fetch('vault/lock.json')).json();
  $('#lockQ').textContent = lock.question;
  $('#lockNote').textContent = lock.note || '';
  $('#lockHint').textContent = lock.hint || '';
  gsap.from('#lock .lock-card > *', { opacity: 0, y: 20, stagger: 0.15, duration: 1, ease: 'power3.out' });
  const salt = Uint8Array.from(atob(lock.salt), c => c.charCodeAt(0));
  for (;;) {
    const answer = await new Promise(r => $('#lockForm').onsubmit = e => { e.preventDefault(); r($('#lockInput').value); });
    $('#lockBtn').textContent = 'Checking…';
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(normalize(answer)), 'PBKDF2', false, ['deriveKey']);
    const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: lock.iterations, hash: 'SHA-256' },
      base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
    let config;
    try { config = JSON.parse(new TextDecoder().decode(await openFile('vault/config.bin', key))); }
    catch {
      $('#lockBtn').textContent = 'Unlock';
      $('#lockInput').value = '';
      gsap.fromTo('.lock-card', { x: -12 }, { x: 0, duration: 0.5, ease: 'elastic.out(1, 0.3)' });
      $('#lockHint').textContent = 'Not quite… try again 💭';
      continue;
    }
    $('#lockBtn').textContent = 'Opening our memories…';
    $('#lockIcon').textContent = '🔓';
    gsap.fromTo('#lockIcon', { scale: 1.6 }, { scale: 1, duration: 0.7, ease: 'back.out(3)' });
    const blobs = new Map();
    const blobUrl = (path, type) => blobs.get(path) || blobs.set(path,
      openFile(path, key).then(b => URL.createObjectURL(new Blob([b], { type })))).get(path);
    const photos = [...config.memories, ...config.gallery, config.finale].filter(m => m?.src);
    await Promise.all(photos.map(async m => m.src = await blobUrl(m.src, m.type)));
    // decode up front so photos never paint half-loaded while scrolling on phones
    await Promise.all(photos.map(m => Object.assign(new Image(), { src: m.src }).decode().catch(() => {})));
    if (config.music) config.music = await blobUrl(config.music, config.musicType);
    await gsap.to('#lock', { opacity: 0, duration: 1.2 });
    $('#lock').remove();
    return config;
  }
}
const C = await unlock();

document.querySelectorAll('[data-name]').forEach(e => e.textContent = C.name);
document.querySelectorAll('[data-nick]').forEach((e, i) => e.textContent = C.nicknames[i % C.nicknames.length]);

/* ---------- music ---------- */
// with no music file, an original music-box lullaby (no copyright) is played live: F–G–Em–Am, two phrases
const CHORDS = [[53, 57, 60], [55, 59, 62], [52, 55, 59], [57, 60, 64]];
const TUNE = [ // [midi note, beats] for each bar
  [[77, 1.5], [76, .5], [72, 2]], [[74, 1.5], [72, .5], [71, 1], [67, 1]], [[71, 1.5], [72, .5], [74, 1], [76, 1]], [[76, 1], [72, 1], [69, 2]],
  [[81, 1.5], [79, .5], [77, 1], [76, 1]], [[74, 1], [76, 1], [79, 2]], [[76, 1.5], [74, .5], [71, 2]], [[69, 4]],
];
function musicBox() {
  const ac = new AudioContext(), out = ac.createGain(), verb = ac.createConvolver(), wet = ac.createGain();
  verb.buffer = ac.createBuffer(2, ac.sampleRate * 3, ac.sampleRate);
  for (let c = 0; c < 2; c++) verb.buffer.getChannelData(c).forEach((_, i, d) => d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 4);
  wet.gain.value = 0.6;
  out.connect(ac.destination);
  out.connect(verb).connect(wet).connect(ac.destination);
  const note = (midi, t, vol, len) => {
    const g = ac.createGain(), f = 440 * 2 ** ((midi - 69) / 12);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    g.connect(out);
    for (const [mult, amp] of [[1, 1], [4, 0.12]]) { // the faint 4th harmonic gives the bell-like tine
      const o = ac.createOscillator(), a = ac.createGain();
      o.frequency.value = f * mult;
      a.gain.value = amp;
      o.connect(a).connect(g);
      o.start(t);
      o.stop(t + len);
    }
  };
  const beat = 60 / 68;
  let bar = 0, next = ac.currentTime + 0.3;
  setInterval(() => {
    while (next < ac.currentTime + 1.5) {
      const chord = CHORDS[bar % 4], ext = [...chord, ...chord.map(n => n + 12)];
      note(chord[0] - 12, next, 0.14, beat * 4);
      [0, 2, 3, 4, 5, 4, 3, 2].forEach((k, i) => note(ext[k], next + i * beat / 2, 0.05, 1.8));
      let t = next;
      for (const [m, b] of TUNE[bar % TUNE.length]) { note(m, t, 0.2, b * beat + 1.4); t += b * beat; }
      next += 4 * beat;
      bar++;
    }
  }, 300);
  out.gain.setValueAtTime(0, ac.currentTime);
  out.gain.linearRampToValueAtTime(0.8, ac.currentTime + 4);
  return ac;
}

const music = $('#music'), musicBtn = $('#musicBtn');
let box;
if (C.music) music.src = C.music;
music.onerror = () => musicBtn.classList.add('hidden');
musicBtn.onclick = () => box ? (box.state === 'running' ? box.suspend() : box.resume()) : music.paused ? music.play() : music.pause();
function startMusic() {
  if (!C.music) {
    box = musicBox();
    musicBtn.classList.remove('hidden');
    return;
  }
  music.volume = 0;
  music.play().then(() => {
    musicBtn.classList.remove('hidden');
    gsap.to(music, { volume: 0.8, duration: 4 });
  }).catch(() => {});
}

/* ---------- three.js night sky ---------- */
const renderer = new THREE.WebGLRenderer({ canvas: $('#sky'), antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05040f);
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 3000);

function glowTexture(inner, outer) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'), grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, inner); grd.addColorStop(0.25, outer); grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

const sky = { travel: 0, speed: 0.12, streak: 0, px: 0, py: 0 };
const pointVert = `
  attribute float aSize; attribute float aPhase; attribute vec3 aColor;
  uniform float uTime; uniform float uTravel; uniform float uPixel;
  varying vec3 vColor; varying float vAlpha;
  void main() {
    vec3 p = position;
    p.z = mod(p.z + uTravel, 1000.0) - 1000.0;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float tw = 0.55 + 0.45 * sin(uTime * 1.7 + aPhase);
    gl_PointSize = min(aSize * uPixel * (550.0 / -mv.z), 36.0);
    vColor = aColor;
    vAlpha = tw * (1.0 - smoothstep(-40.0, 0.0, mv.z)) * smoothstep(-1000.0, -850.0, p.z);
  }`;
const pointFrag = `
  varying vec3 vColor; varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = pow(smoothstep(0.5, 0.0, d), 1.8);
    gl_FragColor = vec4(vColor, a * vAlpha);
  }`;

const STARS = isMobile ? 3000 : 5500;
const starGeo = new THREE.BufferGeometry();
{
  const pos = [], size = [], phase = [], col = [];
  const palette = [[1, 1, 1], [0.8, 0.88, 1], [1, 0.9, 0.7], [1, 0.75, 0.85]].map(c => new THREE.Color(...c));
  for (let i = 0; i < STARS; i++) {
    pos.push(rand(-700, 700), rand(-450, 450), rand(-1000, 0));
    size.push(Math.random() < 0.05 ? rand(6, 10) : rand(1.5, 4));
    phase.push(rand(0, Math.PI * 2));
    const c = palette[(Math.random() * palette.length) | 0];
    col.push(c.r, c.g, c.b);
  }
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  starGeo.setAttribute('aSize', new THREE.Float32BufferAttribute(size, 1));
  starGeo.setAttribute('aPhase', new THREE.Float32BufferAttribute(phase, 1));
  starGeo.setAttribute('aColor', new THREE.Float32BufferAttribute(col, 3));
}
const starUniforms = { uTime: { value: 0 }, uTravel: { value: 0 }, uPixel: { value: renderer.getPixelRatio() } };
scene.add(new THREE.Points(starGeo, new THREE.ShaderMaterial({
  uniforms: starUniforms, vertexShader: pointVert, fragmentShader: pointFrag,
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
})));

// warp streaks: each star gets a tail whose length follows the speed
const STREAKS = isMobile ? 700 : 1500;
const streakGeo = new THREE.BufferGeometry();
{
  const pos = [], end = [];
  for (let i = 0; i < STREAKS; i++) {
    const x = rand(-500, 500), y = rand(-320, 320), z = rand(-1000, 0);
    pos.push(x, y, z, x, y, z); end.push(0, 1);
  }
  streakGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  streakGeo.setAttribute('aEnd', new THREE.Float32BufferAttribute(end, 1));
}
const streakUniforms = { uTravel: starUniforms.uTravel, uLen: { value: 0 }, uOpacity: { value: 0 } };
scene.add(new THREE.LineSegments(streakGeo, new THREE.ShaderMaterial({
  uniforms: streakUniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  vertexShader: `attribute float aEnd; uniform float uTravel; uniform float uLen; varying float vA;
    void main() { vec3 p = position; p.z = mod(p.z + uTravel, 1000.0) - 1000.0 - aEnd * uLen; vA = 1.0 - aEnd;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }`,
  fragmentShader: `uniform float uOpacity; varying float vA; void main() { gl_FragColor = vec4(0.8, 0.86, 1.0, vA * uOpacity); }`,
})));

// nebula clouds
[[0x7b3fa0, -260, 120], [0xc0446e, 280, -90], [0x2c4fa8, 40, 200], [0x9a3b7d, -120, -180]].forEach(([color, x, y]) => {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture('rgba(255,255,255,0.9)', 'rgba(255,255,255,0.25)'), color,
    transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  s.position.set(x, y, -700); s.scale.setScalar(rand(1100, 1500));
  scene.add(s);
});

/* ---------- wish stars to hunt ---------- */
const wishTex = glowTexture('rgba(255,255,255,1)', 'rgba(255,214,140,0.55)');
const wishStars = [];
const visibleAt = d => { const h = 2 * d * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)); return [h * camera.aspect, h]; };
function placeWishStars() {
  const [vw, vh] = visibleAt(80);
  const spots = [];
  C.reasons.forEach(() => {
    let p, tries = 0;
    do { p = [rand(-0.4, 0.4) * vw, rand(-0.36, 0.22) * vh]; tries++; }
    while (tries < 60 && spots.some(q => Math.hypot(q[0] - p[0], q[1] - p[1]) < Math.min(vw, vh) * 0.2));
    spots.push(p);
  });
  spots.forEach(([x, y], i) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({
      map: wishTex, color: 0xffe2a8, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    s.position.set(x, y, -80); s.userData = { i, phase: rand(0, 6), found: false, base: isMobile ? 12 : 10 };
    scene.add(s); wishStars.push(s);
    gsap.to(s.material, { opacity: 1, duration: 1.5, delay: 0.3 + i * 0.25 });
  });
}

/* ---------- star-particles that spell her name ---------- */
let nameUniforms;
async function buildName() {
  await document.fonts.load('200px "Great Vibes"');
  const w = 1400, h = 360, cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const g = cv.getContext('2d');
  let size = 260;
  do { g.font = `${size}px "Great Vibes"`; size -= 10; } while (g.measureText(C.name).width > w * 0.92);
  g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(C.name, w / 2, h / 2);
  const data = g.getImageData(0, 0, w, h).data, pts = [];
  for (let y = 0; y < h; y += 3) for (let x = 0; x < w; x += 3) if (data[(y * w + x) * 4 + 3] > 140) pts.push([x, y]);

  const N = isMobile ? 1600 : 2600, dist = 120;
  const [vw, vh] = visibleAt(dist), scale = Math.min((vw * 0.86) / w, (vh * 0.42) / h);
  const start = [], target = [], delay = [], sizes = [], phase = [];
  for (let i = 0; i < N; i++) {
    const p = pts[(Math.random() * pts.length) | 0];
    start.push(rand(-1.2, 1.2) * vw, rand(-1, 1) * vh, -dist - rand(0, 600));
    target.push((p[0] - w / 2) * scale, -(p[1] - h / 2) * scale + vh * 0.06, -dist);
    delay.push(rand(0, 0.45)); sizes.push(rand(1.2, 2.6)); phase.push(rand(0, 6.28));
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(target, 3));
  geo.setAttribute('aStart', new THREE.Float32BufferAttribute(start, 3));
  geo.setAttribute('aDelay', new THREE.Float32BufferAttribute(delay, 1));
  geo.setAttribute('aSize', new THREE.Float32BufferAttribute(sizes, 1));
  geo.setAttribute('aPhase', new THREE.Float32BufferAttribute(phase, 1));
  nameUniforms = { uMorph: { value: 0 }, uTime: starUniforms.uTime, uPixel: starUniforms.uPixel, uFade: { value: 1 } };
  scene.add(new THREE.Points(geo, new THREE.ShaderMaterial({
    uniforms: nameUniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `attribute vec3 aStart; attribute float aDelay; attribute float aSize; attribute float aPhase;
      uniform float uMorph; uniform float uTime; uniform float uPixel; varying float vAlpha;
      void main() {
        float t = smoothstep(0.0, 1.0, clamp((uMorph - aDelay) / 0.55, 0.0, 1.0));
        vec3 p = mix(aStart, position, t);
        p.xy += vec2(sin(uTime + aPhase), cos(uTime * 0.8 + aPhase)) * 0.35 * t;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = aSize * uPixel * (300.0 / -mv.z) * (0.8 + 0.4 * sin(uTime * 3.0 + aPhase));
        vAlpha = t;
      }`,
    fragmentShader: `uniform float uFade; varying float vAlpha;
      void main() { float a = pow(smoothstep(0.5, 0.0, length(gl_PointCoord - 0.5)), 1.5);
        gl_FragColor = vec4(1.0, 0.86, 0.6, a * vAlpha * uFade); }`,
  })));
}

/* ---------- render loop ---------- */
const pointer = { x: 0, y: 0 };
addEventListener('pointermove', e => { pointer.x = e.clientX / innerWidth - 0.5; pointer.y = e.clientY / innerHeight - 0.5; });
addEventListener('deviceorientation', e => {
  if (e.gamma == null) return;
  pointer.x = THREE.MathUtils.clamp(e.gamma / 60, -0.5, 0.5);
  pointer.y = THREE.MathUtils.clamp((e.beta - 45) / 60, -0.5, 0.5);
});
let last = performance.now();
renderer.setAnimationLoop(now => {
  const dt = Math.min((now - last) / 16.67, 3); last = now;
  sky.travel += sky.speed * dt;
  starUniforms.uTime.value = now / 1000;
  starUniforms.uTravel.value = sky.travel;
  streakUniforms.uLen.value = sky.speed * 7;
  streakUniforms.uOpacity.value = Math.min(sky.speed / 8, 1) * 0.9;
  sky.px += (pointer.x - sky.px) * 0.04; sky.py += (pointer.y - sky.py) * 0.04;
  camera.rotation.y = -sky.px * 0.12; camera.rotation.x = -sky.py * 0.08;
  wishStars.forEach(s => {
    if (!s.userData.found) s.scale.setScalar(s.userData.base * (1 + 0.25 * Math.sin(now / 400 + s.userData.phase)));
  });
  renderer.render(scene, camera);
});
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight); sizeFx();
});

/* ---------- fireworks (2D overlay) ---------- */
const fx = $('#fx'), ctx = fx.getContext('2d');
let rockets = [], sparks = [], fxUntil = 0, fxRunning = false, W, H;
function sizeFx() {
  const dpr = Math.min(devicePixelRatio, 2); W = innerWidth; H = innerHeight;
  fx.width = W * dpr; fx.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
sizeFx();
function fireworks(ms) {
  fxUntil = Math.max(fxUntil, performance.now() + ms);
  if (!fxRunning) { fxRunning = true; requestAnimationFrame(fxLoop); }
}
function fxLoop(now) {
  if (now < fxUntil && Math.random() < 0.06) {
    rockets.push({ x: rand(0.15, 0.85) * W, y: H, vx: rand(-1, 1), vy: -rand(0.95, 1.25) * Math.sqrt(H) * 0.55, hue: rand(0, 360) });
  }
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'lighter';
  rockets = rockets.filter(r => {
    r.x += r.vx; r.y += r.vy; r.vy += 0.18;
    ctx.fillStyle = `hsl(${r.hue},100%,80%)`; ctx.fillRect(r.x, r.y, 2, 6);
    if (r.vy < -1) return true;
    const n = isMobile ? 60 : 110;
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2), sp = rand(1, 6);
      sparks.push({ x: r.x, y: r.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1, hue: r.hue + rand(-25, 25) });
    }
    return false;
  });
  sparks = sparks.filter(p => {
    p.x += p.vx; p.y += p.vy; p.vx *= 0.97; p.vy = p.vy * 0.97 + 0.06; p.life -= 0.012;
    ctx.fillStyle = `hsla(${p.hue},100%,65%,${p.life})`;
    ctx.beginPath(); ctx.arc(p.x, p.y, 1.8, 0, 7); ctx.fill();
    return p.life > 0;
  });
  if (now < fxUntil || rockets.length || sparks.length) requestAnimationFrame(fxLoop);
  else { ctx.clearRect(0, 0, W, H); fxRunning = false; }
}

/* ---------- shooting stars ---------- */
setInterval(() => {
  if (document.hidden) return;
  const s = document.createElement('div'); s.className = 'shoot'; document.body.appendChild(s);
  const x = rand(0.1, 0.9) * innerWidth, y = rand(0, 0.4) * innerHeight;
  gsap.fromTo(s, { x, y, rotate: 150, opacity: 0 }, {
    x: x - 500, y: y + 280, opacity: 1, duration: 1.1, ease: 'power1.in',
    onComplete: () => s.remove(),
  });
}, 4200);

/* ---------- scene 1: intro ---------- */
const show = (id, on = true) => $(id).classList.toggle('hidden', !on);
const tlIntro = gsap.timeline({ delay: 0.6 });
tlIntro.to('.intro-lines p', { opacity: 1, y: 0, startAt: { y: 24, filter: 'blur(8px)' }, filter: 'blur(0px)', duration: 1.4, stagger: 1.1, ease: 'power3.out' })
  .to('#readyBtn', { opacity: 1, duration: 1 }, '-=0.3');

$('#readyBtn').onclick = async () => {
  startMusic();
  if (window.DeviceOrientationEvent?.requestPermission) DeviceOrientationEvent.requestPermission().catch(() => {});
  await gsap.to(['.intro-lines', '#readyBtn'], { opacity: 0, y: -20, duration: 0.6 });
  $('#readyBtn').style.pointerEvents = 'none';
  const ring = $('#countdown circle'), count = $('#count');
  for (const n of [3, 2, 1]) {
    count.textContent = n;
    gsap.fromTo(ring, { strokeDashoffset: 629 }, { strokeDashoffset: 0, duration: 0.95, ease: 'power2.inOut' });
    await gsap.fromTo(count, { opacity: 0, scale: 1.8, filter: 'blur(12px)' }, { opacity: 1, scale: 1, filter: 'blur(0px)', duration: 0.5, ease: 'power3.out' });
    await gsap.to(count, { opacity: 0, scale: 0.6, duration: 0.45, delay: 0.05 });
  }
  gsap.to(ring, { opacity: 0, duration: 0.3 });
  // warp jump into the stars
  gsap.to('#intro', { background: 'rgba(0,0,0,0)', duration: 0.8 });
  gsap.to(camera, { fov: 95, duration: 1.6, ease: 'power2.in', onUpdate: () => camera.updateProjectionMatrix() });
  await gsap.to(sky, { speed: 32, duration: 1.6, ease: 'power2.in' });
  gsap.fromTo('#flash', { opacity: 0.85 }, { opacity: 0, duration: 1.2 });
  gsap.to(camera, { fov: 60, duration: 2.4, ease: 'power3.out', onUpdate: () => camera.updateProjectionMatrix() });
  await gsap.to(sky, { speed: 0.12, duration: 2.4, ease: 'power3.out' });
  show('#intro', false);
  startHunt();
};

/* ---------- scene 2: star hunt ---------- */
let state = 'intro', found = 0;
function startHunt() {
  state = 'hunt';
  $('#dots').innerHTML = C.reasons.map(() => '<i></i>').join('');
  show('#hud');
  gsap.from('#hud > *', { opacity: 0, y: -20, duration: 1, stagger: 0.2 });
  placeWishStars();
  buildName();
}

function nearestWishStar(x, y) {
  let best = null, bestD = isMobile ? 60 : 50;
  wishStars.forEach(s => {
    if (s.userData.found) return;
    const v = s.position.clone().project(camera);
    const d = Math.hypot((v.x + 1) / 2 * innerWidth - x, (1 - v.y) / 2 * innerHeight - y);
    if (d < bestD) { bestD = d; best = s; }
  });
  return best;
}

addEventListener('pointerdown', e => {
  if (state === 'card') return closeCard();
  if (state !== 'hunt') return;
  const s = nearestWishStar(e.clientX, e.clientY);
  if (!s) return;
  s.userData.found = true;
  gsap.to(s.scale, { x: 40, y: 40, duration: 0.9, ease: 'power2.out' });
  gsap.to(s.material, { opacity: 0, duration: 0.9 });
  $('#dots').children[found].classList.add('on');
  found++;
  openCard(s.userData.i);
});

function openCard(i) {
  state = 'opening';
  $('#reasonNum').textContent = `secret ${found} of ${C.reasons.length}`;
  $('#reasonText').textContent = C.reasons[i];
  show('#cardLayer');
  gsap.fromTo('#reasonCard', { opacity: 0, scale: 0.85, y: 30, rotateX: -25 },
    { opacity: 1, scale: 1, y: 0, rotateX: 0, duration: 0.8, ease: 'back.out(1.6)', onComplete: () => state = 'card' });
}

async function closeCard() {
  state = 'closing';
  await gsap.to('#reasonCard', { opacity: 0, scale: 0.9, y: -20, duration: 0.4 });
  show('#cardLayer', false);
  if (found < C.reasons.length) { state = 'hunt'; return; }
  revealName();
}

/* ---------- scene 3: her name in the stars ---------- */
async function revealName() {
  state = 'name';
  await gsap.to('#hud', { opacity: 0, duration: 0.8 });
  show('#hud', false);
  while (!nameUniforms) await wait(100);
  gsap.to(sky, { speed: 0.04, duration: 2 });
  await gsap.to(nameUniforms.uMorph, { value: 1.05, duration: 4.5, ease: 'power2.inOut' });
  show('#nameLayer');
  await gsap.fromTo('#nameLayer h2', { opacity: 0, letterSpacing: '0.8em' }, { opacity: 1, letterSpacing: '0.2em', duration: 1.6, ease: 'power3.out' });
  fireworks(2500);
  gsap.to('#wishBtn', { opacity: 1, duration: 1, delay: 0.8 });
}

$('#wishBtn').onclick = async () => {
  await gsap.to('#nameLayer', { opacity: 0, duration: 0.6 });
  show('#nameLayer', false);
  gsap.to(nameUniforms.uFade, { value: 0.1, duration: 1.5 });
  showCake();
};

/* ---------- scene 4: cake ---------- */
let lit = 0;
const candleEls = [];
function showCake() {
  state = 'cake';
  const n = Math.max(1, C.candles);
  lit = n;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + 0.3, x = Math.cos(a) * 52, y = Math.sin(a) * 11;
    const c = document.createElement('div');
    c.className = 'candle';
    c.style.left = x + 'px'; c.style.bottom = (y - 6) + 'px'; c.style.zIndex = Math.round(50 - y);
    c.innerHTML = '<div class="flame"></div>';
    c.onclick = () => blow(c);
    $('#candles').appendChild(c); candleEls.push(c);
  }
  show('#cakeLayer');
  gsap.from('#cakeLayer', { opacity: 0, duration: 1 });
  gsap.from('.cake', { y: 120, opacity: 0, rotateX: 40, duration: 1.4, ease: 'power3.out' });
  gsap.from('.candle', { y: -60, opacity: 0, duration: 0.6, stagger: 0.12, delay: 0.8, ease: 'bounce.out' });
}

function blow(c) {
  if (!c || c.classList.contains('out')) return;
  c.classList.add('out');
  const s = document.createElement('div'); s.className = 'smoke'; c.appendChild(s);
  if (--lit === 0) celebrate();
}

$('#micBtn').onclick = async () => {
  const btn = $('#micBtn');
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const ac = new AudioContext(), an = ac.createAnalyser(); an.fftSize = 512;
    ac.createMediaStreamSource(stream).connect(an);
    const buf = new Uint8Array(an.fftSize);
    let lastBlow = 0;
    btn.textContent = 'Now blow! 🌬️';
    (function listen(t) {
      if (lit === 0) { stream.getTracks().forEach(tr => tr.stop()); ac.close(); return; }
      an.getByteTimeDomainData(buf);
      let sum = 0; for (const v of buf) sum += ((v - 128) / 128) ** 2;
      if (Math.sqrt(sum / buf.length) > BLOW_THRESHOLD && t - lastBlow > 140) {
        lastBlow = t; blow(candleEls.find(c => !c.classList.contains('out')));
      }
      requestAnimationFrame(listen);
    })(0);
  } catch {
    btn.textContent = 'No mic? Tap the flames 🕯️';
  }
};

async function celebrate() {
  state = 'party';
  gsap.to('#micBtn', { opacity: 0, duration: 0.4 });
  $('#cakeHint').textContent = 'your wish is on its way to the stars ✨';
  $('#cakeTitle').textContent = `Happy Birthday, ${C.nicknames.at(-1)}!`;
  gsap.fromTo('#cakeTitle', { scale: 0.6, opacity: 0 }, { scale: 1, opacity: 1, duration: 1, ease: 'back.out(2)' });
  fireworks(7000);
  gsap.to(sky, { speed: 0.6, duration: 2 });
  await wait(7500);
  toStory();
}

/* ---------- scene 5: "not done yet" → story ---------- */
function splitWords(el) {
  el.innerHTML = el.textContent.split(' ').map(w => `<span class="w">${w}</span>`).join(' ');
}
async function toStory() {
  state = 'story';
  show('#quote');
  splitWords($('#quoteMain')); splitWords($('#quoteSub'));
  await gsap.to('#quote', { opacity: 1, duration: 1.4 });
  show('#cakeLayer', false);
  await gsap.to('#quoteMain .w', { opacity: 1, y: 0, startAt: { y: 20, filter: 'blur(6px)' }, filter: 'blur(0px)', stagger: 0.18, duration: 0.8 });
  await wait(900);
  await gsap.to('#quoteSub .w', { opacity: 1, stagger: 0.09, duration: 0.6 });
  await wait(2200);
  buildStory();
  document.body.classList.remove('locked');
  show('#story');
  scrollTo(0, 0);
  gsap.to(sky, { speed: 0.08, duration: 2 });
  gsap.to(nameUniforms?.uFade ?? {}, { value: 0, duration: 2 });
  ScrollTrigger.refresh();
  await gsap.to('#quote', { opacity: 0, duration: 1.6 });
  show('#quote', false);
}

const imgTag = src => `<img src="${src}" alt="" onerror="this.style.visibility='hidden'">`;
function buildStory() {
  $('#chapters').innerHTML = C.memories.map((m, i) => `
    <section class="chapter">
      <div class="ch-media">${imgTag(m.src)}
        ${m.stamp ? `<div class="stamp"><b>${m.stamp.split(' ')[0]}</b><small>${m.stamp.split(' ').slice(1).join(' ')}</small></div>` : ''}
        ${m.zzz ? '<div class="zzz"><i>z</i><i>z</i><i>Z</i></div>' : ''}</div>
      <div class="ch-text">
        <span class="ch-num">${String(i + 1).padStart(2, '0')}</span>
        <p class="ch-date reveal">${m.date}</p>
        <h3 class="reveal">${m.title}</h3>
        <p class="body reveal">${m.text}</p>
      </div>
    </section>`).join('');
  const gallery = C.gallery.length ? C.gallery : C.memories;
  $('#track').innerHTML = gallery.map(m => `<figure class="polaroid">${imgTag(m.src)}<span>${m.title || ''}</span></figure>`).join('');
  $('#sign').textContent = C.from;
  if (C.storyTitle) $('#storyTitle').innerHTML = C.storyTitle;

  gsap.from('.s-hero > *', { opacity: 0, y: 40, stagger: 0.25, duration: 1.4, ease: 'power3.out', delay: 0.6 });

  document.querySelectorAll('.chapter').forEach(ch => {
    const media = ch.querySelector('.ch-media');
    gsap.to(media, { clipPath: 'inset(0% 0 0 0)', ease: 'none', scrollTrigger: { trigger: ch, start: 'top 85%', end: 'top 25%', scrub: 1 } });
    gsap.to(media.querySelector('img'), { scale: 1, ease: 'none', scrollTrigger: { trigger: ch, start: 'top bottom', end: 'bottom top', scrub: 1 } });
    const stamp = ch.querySelector('.stamp');
    if (stamp) gsap.from(stamp, { scale: 3, opacity: 0, rotate: 30, duration: 0.6, ease: 'back.out(2)', scrollTrigger: { trigger: ch, start: 'top 35%' } });
    gsap.from(ch.querySelector('.ch-num'), { y: 120, ease: 'none', scrollTrigger: { trigger: ch, start: 'top bottom', end: 'bottom top', scrub: 1 } });
    gsap.to(ch.querySelectorAll('.reveal'), { opacity: 1, y: 0, stagger: 0.15, duration: 1.1, ease: 'power3.out',
      scrollTrigger: { trigger: ch, start: 'top 55%' } });
  });

  const track = $('#track'), dist = () => Math.max(0, track.scrollWidth - innerWidth);
  gsap.to(track, { x: () => -dist(), ease: 'none', scrollTrigger: {
    trigger: '.gallery', pin: true, scrub: 1, end: () => '+=' + dist(), invalidateOnRefresh: true } });

  ScrollTrigger.create({ trigger: '.s-letter', start: 'top 60%', once: true, onEnter: typeLetter });
  gsap.from('.paper', { y: 120, rotate: -6, opacity: 0, duration: 1.4, ease: 'power3.out', scrollTrigger: { trigger: '.s-letter', start: 'top 75%' } });

  if (C.finale?.src) $('#finalPhoto').src = C.finale.src;
  const ily = $('#ily');
  ily.innerHTML = [...ily.textContent].map(c => `<span class="l">${c === ' ' ? '&nbsp;' : c}</span>`).join('');
  gsap.set(['.s-final > *', '#ily .l'], { opacity: 0 });
  ScrollTrigger.create({ trigger: '.s-final', start: 'top 60%', once: true, onEnter: () => {
    gsap.timeline()
      .fromTo('.final-eyebrow, .s-final h2', { y: 40 }, { opacity: 1, y: 0, stagger: 0.3, duration: 1.4, ease: 'power3.out' })
      .fromTo('.avatar-stage', { scale: 0.6, filter: 'blur(14px)' }, { opacity: 1, scale: 1, filter: 'blur(0px)', duration: 1.6, ease: 'back.out(1.6)',
        onStart: () => setInterval(bubble, 380) }, '-=0.6')
      .set('#ily', { opacity: 1 })
      // slow-mo: each letter drifts in from big and blurred
      .fromTo('#ily .l', { scale: 3, y: 40, filter: 'blur(18px)' }, { opacity: 1, scale: 1, y: 0, filter: 'blur(0px)', duration: 2.4, stagger: 0.2, ease: 'expo.out',
        onComplete: () => { fireworks(6000); gsap.to('#ily', { scale: 1.06, duration: 0.5, yoyo: true, repeat: -1, ease: 'sine.inOut' }); } }, '+=0.3')
      .fromTo('.ily-sub', { y: 30 }, { opacity: 1, y: 0, stagger: 0.9, duration: 1.2, ease: 'power3.out' }, '-=0.8')
      .to('.s-final .glow-btn', { opacity: 1, duration: 1 });
  } });
}

// a little character in a soap bubble pops up around the avatar picture, floats, and bursts
function bubble() {
  const r = $('#bubbles').getBoundingClientRect();
  if (r.bottom < 0 || r.top > innerHeight) return; // off screen

  const b = document.createElement('span');
  b.className = 'bubble';
  b.textContent = ['🧕', '💖', '✨', '🧸', '🌸', '🤍', '⭐', '🫧', '🍅', '😴'][Math.floor(rand(0, 10))];
  const side = Math.random() < 0.5; // hug the left or right edge, anywhere top to bottom
  b.style.left = `${side ? rand(0, 22) : rand(78, 100)}%`;
  b.style.top = `${rand(10, 95)}%`;
  $('#bubbles').append(b);
  gsap.timeline({ onComplete: () => b.remove() })
    .fromTo(b, { scale: 0 }, { scale: rand(0.7, 1.15), duration: 0.5, ease: 'back.out(3)' })
    .to(b, { y: -rand(50, 110), x: rand(-25, 25), duration: rand(1.6, 2.6), ease: 'sine.inOut' }, '<')
    .to(b, { scale: 1.6, opacity: 0, duration: 0.22, ease: 'power2.out' });
}

function typeLetter() {
  const box = $('#letterBody'), text = C.letter;
  let i = 0;
  const t = setInterval(() => {
    box.textContent = text.slice(0, ++i);
    if (i >= text.length) { clearInterval(t); gsap.to('#sign', { opacity: 1, duration: 1.5 }); }
  }, 32);
}

// dev shortcut: open index.html#story to jump straight to the story
if (location.hash === '#story') {
  show('#intro', false);
  nameUniforms = null;
  buildStory();
  document.body.classList.remove('locked');
  show('#story');
  state = 'story';
}
