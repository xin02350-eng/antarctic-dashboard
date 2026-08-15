import { writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const shotDir = join(tmpdir(), 'v4954_shots');
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

const state = await ev(`(() => {
  const btn = document.getElementById('exploreBtn');
  const t = document.querySelector('.hero h1').getBoundingClientRect();
  const m = document.querySelector('.manifesto').getBoundingClientRect();
  const b = btn.getBoundingClientRect();
  const panel = btn.querySelector('.explore-panel').getBoundingClientRect();
  const arr = btn.querySelector('.explore-arrow').getBoundingClientRect();
  const anims = [...btn.querySelectorAll('*')].flatMap(el => [...el.getAnimations()]).map(a => ({
    name: a.animationName,
    state: a.playState,
    dur: a.effect && a.effect.getTiming ? a.effect.getTiming().duration : null
  }));
  const bcs = getComputedStyle(btn, '::before');
  return {
    btn: { x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height) },
    panel: { x: Math.round(panel.left), y: Math.round(panel.top), w: Math.round(panel.width), h: Math.round(panel.height) },
    arrow: { x: Math.round(arr.left), y: Math.round(arr.top) },
    title: { top: Math.round(t.top), bottom: Math.round(t.bottom) },
    manifesto: { top: Math.round(m.top), bottom: Math.round(m.bottom) },
    mid: Math.round((t.bottom + m.top) / 2),
    centerY: Math.round(b.top + b.height / 2),
    anims,
    beforeAnim: bcs.animationName + ' ' + bcs.animationDuration
  };
})()`);
console.log('STATE ' + JSON.stringify(state, null, 2));

await ev(`window.__scan = async function(dataUrl, textX, textY, textW, textH) {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = img.naturalWidth; c.height = img.naturalHeight;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const d = ctx.getImageData(0, 0, c.width, c.height).data;
  let max = 0, bestX = -1, bestY = -1, nText = 0, nRing = 0, nWave = 0;
  for (let y = 0; y < c.height; y++) {
    for (let x = 0; x < c.width; x++) {
      const i = (y * c.width + x) * 4;
      const lum = 0.2126*d[i] + 0.7152*d[i+1] + 0.0722*d[i+2];
      if (lum > max) { max = lum; bestX = x; bestY = y; }
      if (x >= textX && x < textX + textW && y >= textY && y < textY + textH && lum > 240) nText++;
      const dx = Math.min(x, c.width - 1 - x), dy = Math.min(y, c.height - 1 - y);
      const dist = Math.min(dx, dy);
      if (dist <= 5 && lum > 170) nRing++;
      if (dist > 6 && dist <= 18 && lum > 130) nWave++;
    }
  }
  return { max: +max.toFixed(1), bestX, bestY, nText, nRing, nWave };
}; true`);

const out = [];
for (let i = 0; i < 64; i++) {
  const meta = await ev(`(() => {
    const btn = document.getElementById('exploreBtn');
    const b = btn.getBoundingClientRect();
    const span = [...btn.querySelectorAll('.btn-txt')].find(x => x.getClientRects().length);
    const s = span.getBoundingClientRect();
    const arr = btn.querySelector('.explore-arrow').getBoundingClientRect();
    return { bx: b.left, by: b.top, bw: b.width, bh: b.height, sx: s.left, sy: s.top, sw: s.width, sh: s.height, ax: arr.left };
  })()`);
  const x = Math.round(meta.bx - 28), y = Math.round(meta.by - 13), w = Math.round(meta.bw + 36), h = Math.round(meta.bh + 26);
  const cap = await send('Page.captureScreenshot', { format: 'png', clip: { x, y, width: w, height: h, scale: 1 } });
  const sc = await ev(`__scan(${JSON.stringify('data:image/png;base64,' + cap.data)}, ${Math.round(meta.sx - x)}, ${Math.round(meta.sy - y)}, ${Math.round(meta.sw)}, ${Math.round(meta.sh)})`);
  out.push({ i, ...sc, ax: +meta.ax.toFixed(1) });
  if ((i % 12) === 0) {
    writeFileSync(join(shotDir, 'seq_' + i + '.png'), Buffer.from(cap.data, 'base64'));
  }
  await wait(100);
}
console.log('SCAN ' + JSON.stringify(out));
console.log('SHOTS ' + shotDir);
ws.close();
