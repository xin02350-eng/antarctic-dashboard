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
await ev(`(() => {
  const btn = document.getElementById('exploreBtn');
  [...btn.querySelectorAll('*')].forEach(el => el.getAnimations().forEach(a => { a.pause(); a.currentTime = 0; }));
  [...btn.querySelectorAll('*')].forEach(el => el.getAnimations().forEach(a => {
    if (['framePulse','btnPulse','outerFlash'].includes(a.animationName)) a.currentTime = 2790;
  }));
  return true;
})()`);
await wait(150);
const rect = await ev(`(() => { const b = document.getElementById('exploreBtn').getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; })()`);
const cap = await send('Page.captureScreenshot', { format: 'png', clip: { x: Math.round(rect.x - 30), y: Math.round(rect.y - 15), width: Math.round(rect.w + 42), height: Math.round(rect.h + 30), scale: 1 } });
const res = await ev(`(async () => {
  const img = new Image();
  img.src = ${JSON.stringify('data:image/png;base64,' + cap.data)};
  await img.decode();
  const c = document.createElement('canvas');
  c.width = img.naturalWidth; c.height = img.naturalHeight;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const d = ctx.getImageData(0, 0, c.width, c.height).data;
  let nWave = 0, max = 0;
  for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
    const i = (y * c.width + x) * 4;
    const lum = 0.2126*d[i] + 0.7152*d[i+1] + 0.0722*d[i+2];
    if (lum > max) max = lum;
    const dist = Math.min(x, c.width - 1 - x, y, c.height - 1 - y);
    if (dist > 6 && dist <= 18 && lum > 130) nWave++;
  }
  return { nWave, max: +max.toFixed(1) };
})()`);
console.log(JSON.stringify(res));
ws.close();
