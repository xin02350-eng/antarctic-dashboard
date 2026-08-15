import { writeFileSync } from 'node:fs';

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

await ev(`window.__scan = async function(dataUrl) {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = img.naturalWidth; c.height = img.naturalHeight;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const d = ctx.getImageData(0, 0, c.width, c.height).data;
  let n = 0, sx = 0, max = 0, minX = 1e9, maxX = -1;
  for (let y = 0; y < c.height; y++) {
    for (let x = 0; x < c.width; x++) {
      const i = (y * c.width + x) * 4;
      const lum = 0.2126*d[i] + 0.7152*d[i+1] + 0.0722*d[i+2];
      if (lum > max) max = lum;
      if (lum > 240) { sx += x; n++; if (x < minX) minX = x; if (x > maxX) maxX = x; }
    }
  }
  return { n, cx: n ? +(sx / n).toFixed(1) : -1, minX: n ? minX : -1, maxX: n ? maxX : -1, width: n ? maxX - minX + 1 : 0, max: +max.toFixed(1) };
}; true`);

for (const lang of ['zh', 'en']) {
  await ev(`window.anxApplyLang && window.anxApplyLang(${JSON.stringify(lang)}); true`);
  await wait(500);
  const rect = await ev(`(() => {
    const s = [...document.querySelectorAll('.btn-txt')].find(x => x.getClientRects().length);
    const r = s.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  })()`);
  const phases = [
    ['rest', 0],
    ['left', 1848],
    ['mid', 2072],
    ['right', 2296]
  ];
  for (const [name, t] of phases) {
    await ev(`(() => {
      const s = [...document.querySelectorAll('.btn-txt')].find(x => x.getClientRects().length);
      const sh = s.querySelector('.explore-shine');
      const a = sh.getAnimations().find(x => x.animationName === 'txtSweep');
      if (a) { a.pause(); a.currentTime = ${t}; }
      return true;
    })()`);
    await wait(150);
    const cap = await send('Page.captureScreenshot', { format: 'png', clip: { x: Math.round(rect.x - 8), y: Math.round(rect.y - 12), width: Math.round(rect.w + 16), height: Math.round(rect.h + 24), scale: 1 } });
    const s = await ev(`__scan(${JSON.stringify('data:image/png;base64,' + cap.data)})`);
    console.log(lang, name, 't=' + t, JSON.stringify(s), 'textW=' + rect.w);
    const out = await send('Page.captureScreenshot', { format: 'png', clip: { x: Math.round(rect.x - 8), y: Math.round(rect.y - 12), width: Math.round(rect.w + 16), height: Math.round(rect.h + 24), scale: 1 } });
    writeFileSync(`./v49_52_shots/${lang}_${name}.png`, Buffer.from(out.data, 'base64'));
  }
}
ws.close();
