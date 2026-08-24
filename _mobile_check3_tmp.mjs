const pages = ['index.html','network.html','dashboard.html','sensors.html','telemetry.html','hardware.html','analysis.html','location.html'];

const list = await fetch('http://127.0.0.1:9222/json/list').then(r => r.json());
const page = list.find(t => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
ws.onmessage = e => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    const q = pending.get(m.id);
    pending.delete(m.id);
    m.error ? q.rej(new Error(JSON.stringify(m.error))) : q.res(m.result);
  }
};
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
const send = (method, params = {}) => new Promise((res, rej) => {
  const i = ++id;
  pending.set(i, { res, rej });
  ws.send(JSON.stringify({ id: i, method, params }));
});
const ev = async ex => {
  const r = await send('Runtime.evaluate', { expression: ex, returnByValue: true, awaitPromise: true });
  return r.result ? r.result.value : null;
};
await send('Runtime.enable');
await send('Page.enable');

async function audit(p, w, h) {
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 2, mobile: true });
  await send('Page.navigate', { url: 'http://127.0.0.1:8765/' + p + '?v=' + Date.now() });
  await new Promise(r => setTimeout(r, 3200));
  await ev(`if (window.anxApplyLang) window.anxApplyLang('zh'); true`);
  await new Promise(r => setTimeout(r, 250));
  const info = await ev(`(() => {
    const cw = document.documentElement.clientWidth, ch = document.documentElement.clientHeight;
    const sw = document.documentElement.scrollWidth, sh = document.documentElement.scrollHeight;
    const fs = parseFloat(getComputedStyle(document.documentElement).fontSize);
    const map = document.querySelector('#worldMap, #networkMap');
    const mapPE = map ? getComputedStyle(map).pointerEvents : null;
    const main = document.querySelector('main') || document.querySelector('.app') || document.querySelector('.main');
    const blocks = main ? [...main.children].filter(el => {
      const s = getComputedStyle(el); const r = el.getBoundingClientRect();
      return s.display !== 'none' && r.width > 40 && r.height > 30;
    }) : [];
    const overlaps = [];
    for (let i = 0; i < blocks.length; i++) for (let j = i + 1; j < blocks.length; j++) {
      const a = blocks[i].getBoundingClientRect(), b = blocks[j].getBoundingClientRect();
      const s = getComputedStyle(blocks[i]), t = getComputedStyle(blocks[j]);
      if (s.position === 'absolute' || t.position === 'absolute' || s.position === 'fixed' || t.position === 'fixed') continue;
      const ix = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
      const iy = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
      const inter = ix * iy;
      const minArea = Math.min(a.width * a.height, b.width * b.height);
      if (inter > 0.2 * minArea && minArea > 5000) overlaps.push(String(blocks[i].className).slice(0, 20) + '|' + String(blocks[j].className).slice(0, 20));
    }
    return { w: cw, h: ch, sw, sh, hOver: sw > cw + 1, fs: fs.toFixed(1), mapPE, overlaps: overlaps.slice(0, 4) };
  })()`);
  console.log(p + '@' + w + 'x' + h + ' ' + JSON.stringify(info));
}

for (const [p, w, h] of pages.flatMap(p => [[p, 844, 390], [p, 812, 375], [p, 896, 414], [p, 740, 360]])) {
  await audit(p, w, h);
}
ws.close();
