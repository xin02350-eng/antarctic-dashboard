import { writeFileSync } from 'node:fs';

const list = await fetch('http://127.0.0.1:9222/json/list').then(r => r.json());
const page = list.find(t => t.type === 'page');
if (!page) throw new Error('page target not found');

const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
const errors = [];

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const msgId = ++id;
    pending.set(msgId, { resolve, reject });
    ws.send(JSON.stringify({ id: msgId, method, params }));
  });
}

ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(JSON.stringify(msg.error)));
    else resolve(msg.result);
  } else if (msg.method === 'Runtime.exceptionThrown') {
    errors.push((msg.params.exceptionDetails.exception && msg.params.exceptionDetails.exception.description || msg.params.exceptionDetails.text || '').split('\n')[0]);
  }
};

await new Promise((resolve, reject) => {
  ws.onopen = resolve;
  ws.onerror = reject;
});
await send('Runtime.enable');
await send('Network.setCacheDisabled', { cacheDisabled: true });

async function evalJs(expression) {
  const res = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  return res.result ? res.result.value : null;
}
const wait = ms => new Promise(r => setTimeout(r, ms));

const metric = `(() => {
  const rect = sel => { const el = document.querySelector(sel); if (!el) return null; const r = el.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom), Math.round(r.width), Math.round(r.height)]; };
  const lsw = document.querySelector('.lang-switch');
  const lr = lsw ? lsw.getBoundingClientRect() : null;
  return {
    url: location.pathname.split('/').pop(),
    viewport: [innerWidth, innerHeight],
    scrollW: document.documentElement.scrollWidth,
    scrollH: document.documentElement.scrollHeight,
    clientW: document.documentElement.clientWidth,
    clientH: document.documentElement.clientHeight,
    langRect: lr ? [Math.round(lr.left), Math.round(lr.top), Math.round(lr.right), Math.round(lr.bottom)] : null,
    map: rect('#worldMap') || rect('#networkMap'),
    mapPanel: rect('.map-panel') || rect('.map-wrap'),
    gridCols: (() => { const g = document.querySelector('.mission-grid'); return g ? getComputedStyle(g).gridTemplateColumns : null; })(),
    globeReady: !!window.__globeReady
  };
})()`;

const pages = ['index.html', 'network.html', 'location.html', 'dashboard.html', 'dashboard-a02.html', 'dashboard-a03.html', 'sensors.html', 'telemetry.html', 'hardware.html', 'analysis.html'];
const viewports = [[1920, 1080], [1366, 768], [390, 844], [375, 812]];
const out = {};

for (const [w, h] of viewports) {
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 600 });
  for (const p of pages) {
    errors.length = 0;
    await send('Page.navigate', { url: 'http://127.0.0.1:8765/' + p + '?v=' + Date.now() });
    await wait(p === 'index.html' ? 3200 : 2400);
    await evalJs(`window.anxApplyLang && window.anxApplyLang('zh')`);
    await wait(300);
    const m = await evalJs(metric);
    m.errors = [...errors];
    out[p + '@' + w + 'x' + h] = m;
  }
}

writeFileSync(new URL('./v482_regression.json', import.meta.url), JSON.stringify(out, null, 2));
console.log('done', Object.keys(out).length);
ws.close();
