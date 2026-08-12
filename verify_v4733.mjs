import { writeFileSync, mkdirSync } from 'node:fs';

mkdirSync(new URL('./v47_33_screenshots/', import.meta.url), { recursive: true });

const list = await fetch('http://127.0.0.1:9222/json/list').then(r => r.json());
const page = list.find(t => t.type === 'page');
if (!page) throw new Error('page target not found');

const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();

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
  }
};

await new Promise((resolve, reject) => {
  ws.onopen = resolve;
  ws.onerror = reject;
});

async function evalJs(expression) {
  const res = await send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true
  });
  if (res.exceptionDetails) throw new Error(JSON.stringify(res.exceptionDetails));
  return res.result.value;
}

const wait = ms => new Promise(r => setTimeout(r, ms));

async function nav(url) {
  await send('Page.navigate', { url });
  await wait(2600);
}

async function capture(file) {
  const res = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  writeFileSync(new URL(file, import.meta.url), Buffer.from(res.data, 'base64'));
}

await send('Network.setCacheDisabled', { cacheDisabled: true });

const rectJs = `(sel) => {
  const el = document.querySelector(sel);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom), Math.round(r.width), Math.round(r.height)];
}`;

const visibleText = `(el) => {
  if (!el) return null;
  const spans = [...el.querySelectorAll('span')].filter(s => s.getBoundingClientRect().width > 0);
  return spans.map(s => s.textContent.trim()).join(' ').replace(/\\s+/g, ' ').trim();
}`;

const check = `(() => {
  const rect = ${rectJs};
  const vt = ${visibleText};
  const cells = sel => [...document.querySelectorAll(sel)].map(el => {
    const r = el.getBoundingClientRect();
    return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)];
  });
  const lsw = document.querySelector('.lang-switch');
  const lr = lsw ? lsw.getBoundingClientRect() : null;
  const streamRows = [...document.querySelectorAll('.stream-row')].map(r => ({
    text: vt(r),
    em: r.querySelector('em') ? r.querySelector('em').textContent.trim() : null
  }));
  return {
    url: location.pathname.split('/').pop(),
    lang: document.documentElement.getAttribute('lang'),
    title: document.title,
    viewport: [window.innerWidth, window.innerHeight],
    docScrollH: document.documentElement.scrollHeight,
    docClientH: document.documentElement.clientHeight,
    bodyScrollH: document.body.scrollHeight,
    scrollW: document.documentElement.scrollWidth,
    htmlOverflowY: getComputedStyle(document.documentElement).overflowY,
    bodyOverflowY: getComputedStyle(document.body).overflowY,
    header: rect('.mission-header'),
    heroMain: rect('.hero-main'),
    heroStatus: rect('.hero-status'),
    langRect: lr ? [Math.round(lr.left), Math.round(lr.top), Math.round(lr.right), Math.round(lr.bottom)] : null,
    langRightGap: lr ? Math.round(window.innerWidth - lr.right) : null,
    langTopGap: lr ? Math.round(lr.top) : null,
    cmdCells: cells('.dashboard-command-strip .cmd-cell'),
    mapPanel: rect('.map-panel'),
    mapPanelHead: rect('.map-panel-head'),
    mapCells: cells('.map-status-grid .map-cell'),
    worldMap: rect('#worldMap'),
    graticule: rect('#mapGraticule'),
    mapOverlay: rect('.map-overlay'),
    sideRight: rect('.side-right'),
    operationGrid: rect('.operation-grid'),
    streamPanel: rect('.stream-panel'),
    heroSub: document.querySelector('.hero-sub') ? document.querySelector('.hero-sub').textContent.trim() : null,
    systemOnline: document.querySelector('.system-online') ? document.querySelector('.system-online').textContent.trim() : null,
    missionValue: document.querySelector('.cmd-cell .cmd-value') ? document.querySelector('.cmd-cell .cmd-value').textContent.trim() : null,
    modeDisplay: document.querySelector('#modeDisplay') ? document.querySelector('#modeDisplay').textContent.trim() : null,
    mapModeValue: document.querySelector('#mapModeValue') ? document.querySelector('#mapModeValue').textContent.trim() : null,
    time: document.querySelector('#time') ? document.querySelector('#time').textContent.trim() : null,
    latitude: document.querySelector('#latitude') ? document.querySelector('#latitude').textContent.trim() : null,
    longitude: document.querySelector('#longitude') ? document.querySelector('#longitude').textContent.trim() : null,
    satellites: document.querySelector('#satellites') ? document.querySelector('#satellites').textContent.trim() : null,
    mapHeadTitle: document.querySelector('.map-panel-head .panel-title') ? document.querySelector('.map-panel-head .panel-title').textContent.trim() : null,
    nodeBadge: document.querySelector('.node-badge') ? document.querySelector('.node-badge').textContent.trim() : null,
    streamRows,
    counts: {
      sensorCard: document.querySelectorAll('.sensor-card').length,
      cmdCell: document.querySelectorAll('.cmd-cell').length,
      mapCell: document.querySelectorAll('.map-cell').length,
      streamRow: document.querySelectorAll('.stream-row').length,
      navItem: document.querySelectorAll('.sidebar-menu .nav-item').length,
      mapLayer: document.querySelectorAll('#worldMap .map-layer').length
    },
    deviceMap: !!window.deviceMap,
    deviceMarker: !!window.deviceMarker
  };
})()`;

const pages = ['dashboard.html', 'dashboard-a02.html', 'dashboard-a03.html'];
const viewports = [[1920, 1080], [1366, 768], [390, 844]];
const out = {};

for (const [w, h] of viewports) {
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 600 });
  for (const p of pages) {
    await nav('http://127.0.0.1:8765/' + p + '?v=' + Date.now());
    await evalJs(`window.anxApplyLang && window.anxApplyLang('zh')`);
    await wait(900);
    out[p + '@' + w + 'zh'] = await evalJs(check);
    await capture('./v47_33_screenshots/' + p.replace('.html', '') + '-' + w + 'x' + h + '.png');
  }
}

// 英文模式抽查：A02 语言切换必须可用
await send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
await nav('http://127.0.0.1:8765/dashboard-a02.html?v=' + Date.now());
await evalJs(`window.anxApplyLang && window.anxApplyLang('en')`);
await wait(700);
out['dashboard-a02@1920en'] = await evalJs(check);
await capture('./v47_33_screenshots/dashboard-a02-en-1920x1080.png');

writeFileSync(new URL('./v47_33_screenshots/measurements.json', import.meta.url), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
ws.close();
