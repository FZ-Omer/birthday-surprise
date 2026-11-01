// Turns the typed answer into the bytes the key is derived from; shared by seal.mjs and app.js.
// A date in any common format ("14th Feb 2024", "14/02/24", "Feb 14, 2024", "2024-02-14") becomes "20240214".
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function asDate(s) {
  const t = [];
  let named = -1; // index of a month written as a word
  for (const w of s.match(/\d+|\p{L}+/gu) || []) {
    const m = MONTHS.indexOf(w.slice(0, 3));
    if (/^\d+$/.test(w)) t.push(w);
    else if (m >= 0) { named = t.length; t.push(String(m + 1)); }
    else if (!['st', 'nd', 'rd', 'th', 'of'].includes(w)) return null;
  }
  if (t.length === 1 && /^(\d{6}|\d{8})$/.test(t[0])) { // 14022024, 140224, 20240214
    const d = t.pop();
    t.push(...(d.length === 8 && !/(19|20)\d\d$/.test(d) ? [d.slice(0, 4), d.slice(4, 6), d.slice(6)] : [d.slice(0, 2), d.slice(2, 4), d.slice(4)]));
  }
  if (t.length !== 3) return null;
  let y, m, d;
  if (t[0].length === 4) [y, m, d] = t;
  else if (named === 0) [m, d, y] = t;
  else [d, m, y] = t;
  if (+m > 12 && +d <= 12 && named < 0) [m, d] = [d, m]; // 02/14/2024
  if (y.length === 2) y = '20' + y;
  if (y.length !== 4 || !(+m >= 1 && +m <= 12 && +d >= 1 && +d <= 31)) return null;
  return y + m.padStart(2, '0') + d.padStart(2, '0');
}

export function normalize(s) {
  s = s.normalize('NFC').toLowerCase();
  return asDate(s) ?? s.replace(/[^\p{L}\p{N}]/gu, '');
}
