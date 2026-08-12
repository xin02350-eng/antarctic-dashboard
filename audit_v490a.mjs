import { writeFileSync, mkdirSync } from 'node:fs';

const ROOT = './final_compatibility_screenshots/';
mkdirSync(new URL(ROOT, import.meta.url), { recursive: true });
for (const d of ['Chrome_1920', 'Chrome_1366', 'Chrome_2560', 'Edge_1920', 'Edge_1366', 'Tablet_768', 'Tablet_820']) {
  mkdirSync(new URL(ROOT + d + '/', import.meta.url), { recursive: true });
}

const list = await fetch('http://127.0.0.1:9222/json/list').then(r => r.json());
const page = list.find(t => t.type === 'page');
if (!page) throw new Error('page target not found');

const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
let collectedErrors = [];

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
    collectedErrors.push((msg.params.exceptionDetails.exception && msg.params.exceptionDetails.exception.description || msg.params.exceptionDetails.text || '').split('\n')[0].slice(0, 200));
  } else if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') {
    collectedErrors.push('LOG: ' + msg.params.entry.text.slice(0, 200));
  }
};

await new Promise((resolve, reject) => {
  ws.onopen = resolve;
  ws.onerror = reject;
});
await send('Runtime.enable');
await send('Log.enable');
await send('Network.enable');
await send('Network.setCacheDisabled', { cacheDisabled: true });

async function evalJs(expression) {
  const res = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (res.exceptionDetails) return { __evalError: (res.exceptionDetails.exception && res.exceptionDetails.exception.description || res.exceptionDetails.text || '').split('\n')[0] };
  return res.result.value;
}
const wait = ms => new Promise(r => setTimeout(r, ms));

async function nav(url, settle = 2400) {
  await send('Page.navigate', { url });
  await wait(settle);
}
async function capture(file) {
  const res = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  writeFileSync(new URL(file, import.meta.url), Buffer.from(res.data, 'base64'));
}

const visibleTextJs = `(() => {
  const parts = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const n = walker.currentNode;
    const v = (n.nodeValue || '').trim();
    if (!v) continue;
    const el = n.parentElement;
    if (!el) continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') continue;
    const r = document.createRange();
    r.selectNodeContents(n);
    const rc = r.getBoundingClientRect();
    if (!rc.width && !rc.height) continue;
    parts.push(v);
  }
  return parts.join(' ').replace(/\\s+/g, ' ').trim();
})()`;

const checkJs = `(() => {
  const rect = sel => { const el = document.querySelector(sel); if (!el) return null; const r = el.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom), Math.round(r.width), Math.round(r.height)]; };
  const lsw = document.querySelector('.lang-switch');
  const lr = lsw ? lsw.getBoundingClientRect() : null;
  const grid = document.getElementById('mapGraticule');
  const globeCv = document.querySelector('#globe3d canvas');
  return {
    url: location.pathname.split('/').pop(),
    viewport: [innerWidth, innerHeight],
    dpr: window.devicePixelRatio || 1,
    lang: document.documentElement.getAttribute('lang'),
    title: document.title,
    scrollW: document.documentElement.scrollWidth,
    scrollH: document.documentElement.scrollHeight,
    clientW: document.documentElement.clientWidth,
    clientH: document.documentElement.clientHeight,
    langRect: lr ? [Math.round(lr.left), Math.round(lr.top), Math.round(lr.right), Math.round(lr.bottom)] : null,
    header: rect('.mission-header') || rect('.top') || rect('header'),
    mapPanel: rect('.map-panel') || rect('.map-wrap'),
    worldMap: rect('#worldMap') || rect('#networkMap'),
    leaflet: !!document.querySelector('.leaflet-container'),
    tilesLoaded: (() => { const t = [...document.querySelectorAll('.leaflet-tile')]; return t.length > 0 ? t.every(x => x.complete && x.naturalWidth > 0) : null; })(),
    grid: grid ? { css: [grid.clientWidth, grid.clientHeight], buf: [grid.width, grid.height] } : null,
    globeCv: globeCv ? { css: [globeCv.clientWidth, globeCv.clientHeight], buf: [globeCv.width, globeCv.height] } : null,
    globeReady: !!window.__globeReady,
    globeFallbackVisible: (() => { const f = document.querySelector('.globe-fallback'); return f ? getComputedStyle(f).display !== 'none' : null; })(),
    deviceMap: !!window.deviceMap,
    deviceMarker: !!window.deviceMarker,
    markerCoreDiff: (() => {
      if (!window.deviceMap || !window.deviceMarker) return null;
      const p = window.deviceMap.latLngToContainerPoint(window.deviceMarker.getLatLng());
      const core = document.querySelector('.gps-core, .loc-core');
      if (!core) return null;
      const cr = core.getBoundingClientRect();
      const wr = document.querySelector('#worldMap').getBoundingClientRect();
      return [Math.abs(p.x - (cr.left - wr.left + cr.width / 2)), Math.abs(p.y - (cr.top - wr.top + cr.height / 2))];
    })(),
    cmdCells: (() => [...document.querySelectorAll('.dashboard-command-strip .cmd-cell')].map(el => { const r = el.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)]; }))()
  };
})()`;

const keyPages = ['index.html', 'network.html', 'location.html', 'dashboard.html', 'dashboard-a02.html', 'dashboard-a03.html'];
const allPages = [...keyPages, 'sensors.html', 'telemetry.html', 'hardware.html', 'analysis.html',
  'location-a02.html', 'location-a03.html', 'sensors-a02.html', 'sensors-a03.html',
  'telemetry-a02.html', 'telemetry-a03.html', 'hardware-a02.html', 'hardware-a03.html',
  'analysis-a02.html', 'analysis-a03.html', 'a02.html'];

const out = {};

async function scan(p, w, h, dsf = 1, mobile = false, shot = null, lang = 'zh') {
  collectedErrors.length = 0;
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: dsf, mobile });
  await nav('http://127.0.0.1:8765/' + p + '?v=' + Date.now(), p === 'index.html' ? 3000 : 2400);
  await evalJs(`window.anxApplyLang && window.anxApplyLang(${JSON.stringify(lang)})`);
  await wait(400);
  const m = await evalJs(checkJs);
  const text = await evalJs(visibleTextJs);
  if (m && !m.__evalError) m.text = text;
  if (shot) await capture('./final_compatibility_screenshots/' + shot);
  return { page: p, viewport: [w, h], dsf, lang, errors: [...new Set(collectedErrors)], metric: m };
}

// ---- 1) 关键页 × 全电脑分辨率矩阵 ----
const matrix = [
  [3840, 2160, 1], [2560, 1440, 1], [1920, 1080, 1], [1600, 900, 1], [1440, 900, 1],
  [1366, 768, 1], [1280, 800, 1], [1280, 720, 1],
  [1536, 864, 1.25], [1280, 720, 1.5],
  [1242, 698, 1.1], [1093, 614, 1.25], [911, 512, 1.5],
  [1920, 1080, 1.25], [1920, 1080, 1.5], [1920, 1080, 2]
];
for (const [w, h, dsf] of matrix) {
  for (const p of keyPages) {
    out['M_' + p + '@' + w + 'x' + h + 'd' + dsf] = await scan(p, w, h, dsf, false, null);
  }
}

// ---- 2) 指定截图矩阵 ----
const shotMap = [
  ['index.html', 2560, 1440, 1, 'Chrome_2560/index.png'],
  ['network.html', 2560, 1440, 1, 'Chrome_2560/network.png'],
  ['location.html', 2560, 1440, 1, 'Chrome_2560/location.png'],
  ['dashboard.html', 2560, 1440, 1, 'Chrome_2560/dashboard.png'],
  ['dashboard-a02.html', 2560, 1440, 1, 'Chrome_2560/dashboard-a02.png'],
  ['dashboard-a03.html', 2560, 1440, 1, 'Chrome_2560/dashboard-a03.png'],
  ['index.html', 1920, 1080, 1, 'Chrome_1920/index.png'],
  ['network.html', 1920, 1080, 1, 'Chrome_1920/network.png'],
  ['location.html', 1920, 1080, 1, 'Chrome_1920/location.png'],
  ['dashboard.html', 1920, 1080, 1, 'Chrome_1920/dashboard.png'],
  ['dashboard-a02.html', 1920, 1080, 1, 'Chrome_1920/dashboard-a02.png'],
  ['dashboard-a03.html', 1920, 1080, 1, 'Chrome_1920/dashboard-a03.png'],
  ['index.html', 1366, 768, 1, 'Chrome_1366/index.png'],
  ['network.html', 1366, 768, 1, 'Chrome_1366/network.png'],
  ['location.html', 1366, 768, 1, 'Chrome_1366/location.png'],
  ['dashboard.html', 1366, 768, 1, 'Chrome_1366/dashboard.png'],
  ['dashboard-a02.html', 1366, 768, 1, 'Chrome_1366/dashboard-a02.png'],
  ['dashboard-a03.html', 1366, 768, 1, 'Chrome_1366/dashboard-a03.png'],
  ['index.html', 1920, 1080, 1, 'Edge_1920/index.png'],
  ['network.html', 1920, 1080, 1, 'Edge_1920/network.png'],
  ['location.html', 1920, 1080, 1, 'Edge_1920/location.png'],
  ['dashboard.html', 1920, 1080, 1, 'Edge_1920/dashboard.png'],
  ['index.html', 1366, 768, 1, 'Edge_1366/index.png'],
  ['network.html', 1366, 768, 1, 'Edge_1366/network.png'],
  ['location.html', 1366, 768, 1, 'Edge_1366/location.png'],
  ['dashboard.html', 1366, 768, 1, 'Edge_1366/dashboard.png'],
  ['index.html', 768, 1024, 1, 'Tablet_768/index.png'],
  ['network.html', 768, 1024, 1, 'Tablet_768/network.png'],
  ['location.html', 768, 1024, 1, 'Tablet_768/location.png'],
  ['dashboard.html', 768, 1024, 1, 'Tablet_768/dashboard.png'],
  ['index.html', 820, 1180, 1, 'Tablet_820/index.png'],
  ['network.html', 820, 1180, 1, 'Tablet_820/network.png'],
  ['location.html', 820, 1180, 1, 'Tablet_820/location.png'],
  ['dashboard.html', 820, 1180, 1, 'Tablet_820/dashboard.png']
];
for (const [p, w, h, dsf, shot] of shotMap) {
  out['SHOT_' + shot] = await scan(p, w, h, dsf, false, shot);
}

// ---- 3) 全部 21 页：1920zh / 1920en / 1366zh ----
for (const p of allPages) {
  out['A_' + p + '@1920zh'] = await scan(p, 1920, 1080, 1, false, null, 'zh');
}
for (const p of allPages) {
  out['A_' + p + '@1920en'] = await scan(p, 1920, 1080, 1, false, null, 'en');
}
for (const p of allPages) {
  out['A_' + p + '@1366zh'] = await scan(p, 1366, 768, 1, false, null, 'zh');
}

writeFileSync(new URL('./v490_audit_a.json', import.meta.url), JSON.stringify(out, null, 2));
console.log('scans:', Object.keys(out).length);
ws.close();
