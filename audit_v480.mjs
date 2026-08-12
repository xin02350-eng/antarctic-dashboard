import { writeFileSync, mkdirSync } from 'node:fs';

const OUT = './compatibility_screenshots/';
mkdirSync(new URL(OUT, import.meta.url), { recursive: true });

const list = await fetch('http://127.0.0.1:9222/json/list').then(r => r.json());
const page = list.find(t => t.type === 'page');
if (!page) throw new Error('page target not found');

const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
const events = { errors: [], failed: [], logs: [] };

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
    const d = msg.params.exceptionDetails;
    events.errors.push((d.exception && d.exception.description || d.text || '').split('\n')[0].slice(0, 300));
  } else if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') {
    events.logs.push(msg.params.entry.text.slice(0, 300));
  } else if (msg.method === 'Network.loadingFailed') {
    const p = msg.params;
    if (!p.canceled || p.errorText !== 'net::ERR_ABORTED') {
      events.failed.push((p.errorText || '') + ' :: ' + (p.blockedReason || '') + ' :: ' + (p.type || ''));
    }
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
  const res = await send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true
  });
  if (res.exceptionDetails) return { __evalError: (res.exceptionDetails.exception && res.exceptionDetails.exception.description || res.exceptionDetails.text || '').split('\n')[0] };
  return res.result.value;
}

const wait = ms => new Promise(r => setTimeout(r, ms));

async function nav(url, settle = 2800) {
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
  const seen = new Set();
  while (walker.nextNode()) {
    const n = walker.currentNode;
    const v = (n.nodeValue || '').trim();
    if (!v) continue;
    const el = n.parentElement;
    if (!el || seen.has(el)) continue;
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

const pageCheck = `(() => {
  const rect = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom), Math.round(r.width), Math.round(r.height)];
  };
  const lsw = document.querySelector('.lang-switch');
  const lr = lsw ? lsw.getBoundingClientRect() : null;
  const globeCv = document.querySelector('#globe3d canvas');
  const mapCv = document.querySelector('#mapGraticule');
  let gridPixels = 0;
  if (mapCv) {
    try {
      const ctx = mapCv.getContext('2d');
      const w = mapCv.width, h = mapCv.height;
      if (w && h) {
        const img = ctx.getImageData(0, 0, w, h).data;
        for (let i = 3; i < img.length; i += 4) if (img[i] > 0) gridPixels++;
      }
    } catch (e) {}
  }
  const resources = performance.getEntriesByType('resource').map(e => ({
    n: e.name.split('?')[0].split('/').slice(-1)[0],
    s: e.responseStatus,
    d: Math.round(e.duration)
  })).filter(e => e.s >= 400 || (e.s === 0 && e.d > 0));
  return {
    url: location.pathname.split('/').pop(),
    viewport: [window.innerWidth, window.innerHeight],
    lang: document.documentElement.getAttribute('lang'),
    title: document.title,
    scrollW: document.documentElement.scrollWidth,
    scrollH: document.documentElement.scrollHeight,
    clientW: document.documentElement.clientWidth,
    clientH: document.documentElement.clientHeight,
    htmlOverflowY: getComputedStyle(document.documentElement).overflowY,
    bodyOverflowY: getComputedStyle(document.body).overflowY,
    langRect: lr ? [Math.round(lr.left), Math.round(lr.top), Math.round(lr.right), Math.round(lr.bottom)] : null,
    langRightGap: lr ? Math.round(window.innerWidth - lr.right) : null,
    langTopGap: lr ? Math.round(lr.top) : null,
    header: rect('.mission-header') || rect('.top') || rect('header'),
    mapPanel: rect('.map-panel') || rect('.map-wrap'),
    worldMap: rect('#worldMap') || rect('#networkMap'),
    leaflet: !!document.querySelector('.leaflet-container'),
    tiles: [...document.querySelectorAll('.leaflet-tile')].length,
    tilesLoaded: (() => { const t = [...document.querySelectorAll('.leaflet-tile')]; return t.length > 0 && t.every(x => x.complete && x.naturalWidth > 0); })(),
    gridPixels,
    deviceMap: !!window.deviceMap,
    deviceMarker: !!window.deviceMarker,
    globeReady: !!window.__globeReady,
    globeFallbackVisible: (() => { const f = document.querySelector('.globe-fallback'); return f ? getComputedStyle(f).display !== 'none' : null; })(),
    globeCanvas: globeCv ? [globeCv.width, globeCv.height] : null,
    badResources: resources
  };
})()`;

const pages = [
  'index.html', 'network.html', 'location.html', 'dashboard.html',
  'sensors.html', 'telemetry.html', 'hardware.html', 'analysis.html',
  'dashboard-a02.html', 'dashboard-a03.html',
  'location-a02.html', 'location-a03.html', 'sensors-a02.html', 'sensors-a03.html',
  'telemetry-a02.html', 'telemetry-a03.html', 'hardware-a02.html', 'hardware-a03.html',
  'analysis-a02.html', 'analysis-a03.html', 'a02.html'
];

const keyDesktop = ['index.html', 'network.html', 'location.html', 'dashboard.html', 'dashboard-a02.html', 'dashboard-a03.html', 'sensors.html', 'telemetry.html', 'hardware.html', 'analysis.html'];
const keyMobile = keyDesktop;
const key1366 = ['index.html', 'network.html', 'location.html', 'dashboard.html', 'dashboard-a02.html', 'dashboard-a03.html'];

const results = {};

async function scanPage(p, w, h, mobile, shotName, lang) {
  events.errors.length = 0;
  events.failed.length = 0;
  events.logs.length = 0;
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile });
  await nav('http://127.0.0.1:8765/' + p + '?v=' + Date.now(), p === 'index.html' ? 3000 : 2200);
  await evalJs(`window.anxApplyLang && window.anxApplyLang(${JSON.stringify(lang)})`);
  await wait(500);
  const check = await evalJs(pageCheck);
  const text = await evalJs(visibleTextJs);
  if (check && !check.__evalError) check.text = text;
  if (shotName) await capture('./compatibility_screenshots/' + shotName);
  return {
    page: p,
    viewport: [w, h],
    lang,
    errors: [...events.errors],
    failedRequests: [...events.failed],
    logs: [...events.logs],
    check
  };
}

// ---- Chrome / Edge（CDP，Chromium 内核）：关键页截图矩阵 ----
for (const p of keyDesktop) {
  results[p + '@1920zh'] = await scanPage(p, 1920, 1080, false, p.replace('.html', '') + '-chrome-1920x1080.png', 'zh');
}
for (const p of key1366) {
  results[p + '@1366zh'] = await scanPage(p, 1366, 768, false, p.replace('.html', '') + '-chrome-1366x768.png', 'zh');
}
for (const p of keyMobile) {
  results[p + '@390zh'] = await scanPage(p, 390, 844, true, p.replace('.html', '') + '-chrome-390x844.png', 'zh');
}

// ---- 其余分辨率 / 视口（指标级，不重复截图）----
const extraViewports = [[1600, 900], [1440, 900], [1280, 720], [375, 812], [414, 896]];
for (const [w, h] of extraViewports) {
  for (const p of pages) {
    results[p + '@' + w + 'zh'] = await scanPage(p, w, h, w < 600, null, 'zh');
  }
}

// ---- 浏览器缩放近似（125% / 150%：物理分辨率除以缩放，DSF 模拟 DPR）----
const zoomTests = [[1536, 864, 1.25], [1280, 720, 1.5]];
for (const [w, h, dsf] of zoomTests) {
  for (const p of key1366) {
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: dsf, mobile: false });
    await nav('http://127.0.0.1:8765/' + p + '?v=' + Date.now(), p === 'index.html' ? 3000 : 2200);
    await evalJs(`window.anxApplyLang && window.anxApplyLang('zh')`);
    await wait(400);
    const check = await evalJs(pageCheck);
    const text = await evalJs(visibleTextJs);
    if (check && !check.__evalError) check.text = text;
    results[p + '@zoom' + (dsf * 100) + 'zh'] = { page: p, viewport: [w, h], dsf, lang: 'zh', check };
  }
}

// ---- 英文模式抽查（全部页面）----
await send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
for (const p of pages) {
  events.errors.length = 0; events.failed.length = 0; events.logs.length = 0;
  await nav('http://127.0.0.1:8765/' + p + '?v=' + Date.now(), p === 'index.html' ? 3000 : 2200);
  await evalJs(`window.anxApplyLang && window.anxApplyLang('en')`);
  await wait(600);
  const check = await evalJs(pageCheck);
  const text = await evalJs(visibleTextJs);
  if (check && !check.__evalError) check.text = text;
  results[p + '@1920en'] = { page: p, viewport: [1920, 1080], lang: 'en', errors: [...events.errors], failedRequests: [...events.failed], logs: [...events.logs], check };
}

writeFileSync(new URL('./compatibility_audit_raw.json', import.meta.url), JSON.stringify(results, null, 2));
console.log('pages scanned:', Object.keys(results).length);
console.log('done');
ws.close();
