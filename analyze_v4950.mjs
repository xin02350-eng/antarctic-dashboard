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
await new Promise(r => setTimeout(r, 5000));

const ev = async e => { const rr = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); return rr.result ? rr.result.value : null; };
const wait = ms => new Promise(r => setTimeout(r, ms));

// One-time helper injection for analyzing a data URL in the page.
await ev(`window.__analyzeShot = async function(dataUrl, x, y, w, h) {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = img.naturalWidth; c.height = img.naturalHeight;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const d = ctx.getImageData(x, y, w, h).data;
  let sum = 0, max = 0, white = 0, n = 0;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i+1], b = d[i+2], a = d[i+3];
    if (a === 0) continue;
    const lum = 0.2126*r + 0.7152*g + 0.0722*b;
    sum += lum; n++;
    if (lum > max) max = lum;
    if (r >= 232 && g >= 238 && b >= 248) white++;
  }
  return { n, mean: n ? +(sum/n).toFixed(2) : 0, max: +max.toFixed(2), white };
}; true`);

const out = [];
for (let i = 0; i < 60; i++) {
  const shot = await send('Page.captureScreenshot', { format: 'png', clip: { x: 115, y: 650, width: 150, height: 90, scale: 1 } });
  const s = await ev(`__analyzeShot(${JSON.stringify('data:image/png;base64,' + shot.data)}, 15, 30, 125, 26)`);
  out.push({ i, ...s });
  await wait(80);
}
console.log(JSON.stringify(out, null, 2));
ws.close();
