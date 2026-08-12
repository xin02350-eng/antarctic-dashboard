import { writeFileSync, mkdirSync } from 'node:fs';

mkdirSync(new URL('./compatibility_screenshots/v482/', import.meta.url), { recursive: true });

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
    errors.push((msg.params.exceptionDetails.exception && msg.params.exceptionDetails.exception.description || msg.params.exceptionDetails.text || '').split('\n')[0].slice(0, 180));
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
  const grid = document.querySelector('.mission-grid');
  const globe = window.__globe && window.__camera ? (() => {
    try {
      const g = window.__globe, cam = window.__camera;
      g.updateMatrixWorld();
      const c = g.position.clone().project(cam);
      const rw = 100 * g.scale.x;
      const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0).normalize();
      const e = g.position.clone().add(right.multiplyScalar(rw)).project(cam);
      const cx = (c.x * 0.5 + 0.5) * innerWidth;
      const cy = (-c.y * 0.5 + 0.5) * innerHeight;
      const rPx = Math.abs(e.x - c.x) * innerWidth / 2;
      return { cx: Math.round(cx), cy: Math.round(cy), r: Math.round(rPx), bottom: Math.round(cy + rPx) };
    } catch (err) { return null; }
  })() : null;
  return {
    url: location.pathname.split('/').pop(),
    viewport: [innerWidth, innerHeight],
    orientation: innerHeight >= innerWidth ? 'portrait' : 'landscape',
    scrollW: document.documentElement.scrollWidth,
    scrollH: document.documentElement.scrollHeight,
    clientW: document.documentElement.clientWidth,
    clientH: document.documentElement.clientHeight,
    langRect: lr ? [Math.round(lr.left), Math.round(lr.top), Math.round(lr.right), Math.round(lr.bottom)] : null,
    langRightGap: lr ? Math.round(innerWidth - lr.right) : null,
    langTopGap: lr ? Math.round(lr.top) : null,
    header: rect('.mission-header') || rect('.top'),
    hero: rect('.hero'),
    manifesto: rect('.manifesto'),
    globe,
    main: rect('main'),
    missionGrid: grid ? rect('.mission-grid') : null,
    gridCols: grid ? getComputedStyle(grid).gridTemplateColumns : null,
    mapPanel: rect('.map-panel') || rect('.map-wrap'),
    worldMap: rect('#worldMap') || rect('#networkMap'),
    mapOverlay: rect('.map-overlay') || rect('.dossier'),
    statusCard: rect('.status-card') || rect('.side'),
    stream: rect('.stream-panel')
  };
})()`;

const pages = ['index.html', 'network.html', 'location.html', 'dashboard.html', 'dashboard-a02.html', 'dashboard-a03.html'];
const viewports = [[768, 1024], [820, 1180], [834, 1194], [1024, 1366], [1024, 768], [1180, 820], [1194, 834]];
const out = {};

for (const [w, h] of viewports) {
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
  for (const p of pages) {
    errors.length = 0;
    await send('Page.navigate', { url: 'http://127.0.0.1:8765/' + p + '?v=' + Date.now() });
    await wait(p === 'index.html' ? 3200 : 2600);
    await evalJs(`window.anxApplyLang && window.anxApplyLang('zh')`);
    await wait(300);
    const m = await evalJs(metric);
    m.errors = [...errors];
    out[p + '@' + w + 'x' + h] = m;
    await send('Page.captureScreenshot', { format: 'png', fromSurface: true }).then(r => {
      writeFileSync(new URL('./compatibility_screenshots/v482/' + p.replace('.html', '') + '-' + w + 'x' + h + '.png', import.meta.url), Buffer.from(r.data, 'base64'));
    });
  }
}

writeFileSync(new URL('./v482_round1.json', import.meta.url), JSON.stringify(out, null, 2));
console.log('done', Object.keys(out).length);
ws.close();
