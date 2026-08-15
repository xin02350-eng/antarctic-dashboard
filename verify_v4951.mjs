import { writeFileSync, mkdirSync } from 'node:fs';

mkdirSync(new URL('./v49_51_shots/', import.meta.url), { recursive: true });

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

await ev(`window.__scan = async function(dataUrl) {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = img.naturalWidth; c.height = img.naturalHeight;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const d = ctx.getImageData(0, 0, c.width, c.height).data;
  let nC = 0, sxC = 0, minXC = 1e9, maxXC = -1, nS = 0, sxS = 0, minXS = 1e9, maxXS = -1, max = 0;
  for (let y = 0; y < c.height; y++) {
    for (let x = 0; x < c.width; x++) {
      const i = (y * c.width + x) * 4;
      const lum = 0.2126*d[i] + 0.7152*d[i+1] + 0.0722*d[i+2];
      if (lum > max) max = lum;
      if (lum > 245) { sxC += x; nC++; if (x < minXC) minXC = x; if (x > maxXC) maxXC = x; }
      if (lum > 232) { sxS += x; nS++; if (x < minXS) minXS = x; if (x > maxXS) maxXS = x; }
    }
  }
  return {
    coreN: nC, coreCx: nC ? +(sxC / nC).toFixed(1) : -1, coreWidth: nC ? maxXC - minXC + 1 : 0,
    softN: nS, softCx: nS ? +(sxS / nS).toFixed(1) : -1, softWidth: nS ? maxXS - minXS + 1 : 0,
    max: +max.toFixed(1)
  };
}; true`);

const out = [];
let shotIdx = 0;
for (let i = 0; i < 70; i++) {
  const rect = await ev(`(() => {
    const s = [...document.querySelectorAll('.btn-txt')].find(x => x.getClientRects().length);
    const r = s.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  })()`);
  const x = Math.max(0, Math.round(rect.x - 10));
  const y = Math.max(0, Math.round(rect.y - 8));
  const w = Math.round(rect.w + 20);
  const h = Math.round(rect.h + 16);
  const shot = await send('Page.captureScreenshot', { format: 'png', clip: { x, y, width: w, height: h, scale: 1 } });
  const s = await ev(`__scan(${JSON.stringify('data:image/png;base64,' + shot.data)})`);
  out.push({ i, rect: { x: rect.x, y: rect.y, w: rect.w, h: rect.h }, ...s });
  if (s.coreN > 8 && shotIdx < 4) {
    const full = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(new URL(`./v49_51_shots/sweep_${shotIdx}.png`, import.meta.url), Buffer.from(full.data, 'base64'));
    shotIdx++;
  }
  await new Promise(r => setTimeout(r, 20));
}
console.log(JSON.stringify(out, null, 2));
ws.close();
