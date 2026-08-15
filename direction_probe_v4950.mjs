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
await ev(`window.__probe = async function(dataUrl) {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = img.naturalWidth; c.height = img.naturalHeight;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const d = ctx.getImageData(0, 0, c.width, c.height).data;
  let sx = 0, n = 0, minX = 1e9, maxX = -1;
  for (let y = 0; y < c.height; y++) {
    for (let x = 0; x < c.width; x++) {
      const i = (y * c.width + x) * 4;
      const lum = 0.2126*d[i] + 0.7152*d[i+1] + 0.0722*d[i+2];
      if (lum > 240) { sx += x; n++; if (x < minX) minX = x; if (x > maxX) maxX = x; }
    }
  }
  return n ? { cx: +(sx / n).toFixed(1), minX, maxX, n } : { cx: -1, minX: -1, maxX: -1, n: 0 };
}; true`);

// Freeze animation and probe manual background-positions on the visible text span.
const out = [];
for (const pos of [110, 90, 70, 50, 30, 10, -10, -30, -50, -70, -90, -110]) {
  await ev(`(() => {
    const s = [...document.querySelectorAll('.btn-txt')].find(x => x.getClientRects().length);
    s.style.animation = 'none';
    s.style.backgroundPosition = '${pos}% 0';
    return true;
  })()`);
  await new Promise(r => setTimeout(r, 60));
  const shot = await send('Page.captureScreenshot', { format: 'png', clip: { x: 134, y: 685, width: 68, height: 16, scale: 1 } });
  const p = await ev(`__probe(${JSON.stringify('data:image/png;base64,' + shot.data)})`);
  out.push({ pos, ...p });
}
console.log(JSON.stringify(out, null, 2));
ws.close();
