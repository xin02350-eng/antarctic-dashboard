import { writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const shotDir = join(tmpdir(), 'v4958_shots');
mkdirSync(shotDir, { recursive: true });

const list = await fetch('http://127.0.0.1:9222/json/list').then(r => r.json());
const page = list.find(t => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const pending = new Map();
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { const q = pending.get(m.id); pending.delete(m.id); m.error ? q.rej(new Error(JSON.stringify(m.error))) : q.res(m.result); } };
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
await send('Runtime.enable');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: 'http://127.0.0.1:8765/index.html?v=' + Date.now() });
await new Promise(r => setTimeout(r, 7000));
const ev = async e => { const rr = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); return rr.result ? rr.result.value : null; };
const wait = ms => new Promise(r => setTimeout(r, ms));
await ev(`window.anxApplyLang && window.anxApplyLang('zh'); true`);
await wait(500);

await ev(`window.__ascan = async function(dataUrl, tipX) {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = img.naturalWidth; c.height = img.naturalHeight;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const d = ctx.getImageData(0, 0, c.width, c.height).data;
  let n = 0, sx = 0, max = 0, nTip = 0;
  for (let y = 0; y < c.height; y++) {
    for (let x = 0; x < c.width; x++) {
      const i = (y * c.width + x) * 4;
      const lum = 0.2126*d[i] + 0.7152*d[i+1] + 0.0722*d[i+2];
      if (lum > max) max = lum;
      if (lum > 185) { n++; sx += x; if (x >= tipX) nTip++; }
    }
  }
  return { n, cx: n ? +(sx / n).toFixed(1) : -1, max: +max.toFixed(1), nTip };
}; true`);

const out = [];
for (let i = 0; i < 26; i++) {
  const r = await ev(`(() => { const a = document.querySelector('.explore-arrow'); const b = a.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; })()`);
  const x = Math.round(r.x - 4), y = Math.round(r.y - 5), w = Math.round(r.w + 8), h = Math.round(r.h + 10);
  const cap = await send('Page.captureScreenshot', { format: 'png', clip: { x, y, width: w, height: h, scale: 1 } });
  const s = await ev(`__ascan(${JSON.stringify('data:image/png;base64,' + cap.data)}, ${Math.round(w * 0.72)})`);
  out.push({ i, ...s });
  if (i === 6 || i === 14 || i === 22) {
    writeFileSync(join(shotDir, 'live_' + i + '.png'), Buffer.from(cap.data, 'base64'));
  }
  await wait(130);
}
console.log('LIVE ' + JSON.stringify(out));

// Freeze-phase captures
const setPhase = async phases => ev(`(() => {
  const btn = document.getElementById('exploreBtn');
  [...btn.querySelectorAll('*')].forEach(el => el.getAnimations().forEach(a => { a.pause(); a.currentTime = ${phases['*'] || 0}; }));
  const names = ${JSON.stringify(Object.keys(phases))};
  [...btn.querySelectorAll('*')].forEach(el => el.getAnimations().forEach(a => {
    if (names.includes(a.animationName)) a.currentTime = phases[a.animationName];
  }));
  return true;
})()`);
const rect = await ev(`(() => { const a = document.querySelector('.explore-arrow'); const b = a.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; })()`);
const clip = { x: Math.round(rect.x - 6), y: Math.round(rect.y - 8), width: Math.round(rect.w + 12), height: Math.round(rect.h + 16), scale: 1 };

await setPhase({ '*': 0 });
await wait(150);
let cap = await send('Page.captureScreenshot', { format: 'png', clip });
writeFileSync(join(shotDir, 'arrow_rest.png'), Buffer.from(cap.data, 'base64'));

await setPhase({ flowCore: 1850, flowBody: 1850, trail1: 1950, trail2: 1870, trail3: 1790 });
await wait(150);
cap = await send('Page.captureScreenshot', { format: 'png', clip });
writeFileSync(join(shotDir, 'arrow_mid.png'), Buffer.from(cap.data, 'base64'));

await setPhase({ flowCore: 2260, flowBody: 2260, tipFlash: 2260, tipGlint: 2260, arrowAdvance: 2260, trail1: 2100, trail2: 2050, trail3: 2000 });
await wait(150);
cap = await send('Page.captureScreenshot', { format: 'png', clip });
writeFileSync(join(shotDir, 'arrow_tip.png'), Buffer.from(cap.data, 'base64'));

console.log('SHOTS ' + shotDir);
ws.close();
