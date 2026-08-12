import { writeFileSync, mkdirSync } from 'node:fs';

const OUT = './compatibility_screenshots/';
mkdirSync(new URL(OUT, import.meta.url), { recursive: true });

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

async function nav(url, settle = 2200) {
  await send('Page.navigate', { url });
  await wait(settle);
}

async function capture(file) {
  const res = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  writeFileSync(new URL(file, import.meta.url), Buffer.from(res.data, 'base64'));
}

const metricJs = `(() => {
  const rect = sel => { const el = document.querySelector(sel); if (!el) return null; const r = el.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom), Math.round(r.width), Math.round(r.height)]; };
  const lsw = document.querySelector('.lang-switch');
  const lr = lsw ? lsw.getBoundingClientRect() : null;
  const grid = document.getElementById('mapGraticule');
  const globeCv = document.querySelector('#globe3d canvas');
  const dpr = window.devicePixelRatio || 1;
  return {
    url: location.pathname.split('/').pop(),
    viewport: [window.innerWidth, window.innerHeight],
    dpr,
    lang: document.documentElement.getAttribute('lang'),
    title: document.title,
    scrollW: document.documentElement.scrollWidth,
    scrollH: document.documentElement.scrollHeight,
    clientW: document.documentElement.clientWidth,
    clientH: document.documentElement.clientHeight,
    langRect: lr ? [Math.round(lr.left), Math.round(lr.top), Math.round(lr.right), Math.round(lr.bottom)] : null,
    langRightGap: lr ? Math.round(window.innerWidth - lr.right) : null,
    langTopGap: lr ? Math.round(lr.top) : null,
    header: rect('.mission-header') || rect('.top') || rect('header'),
    worldMap: rect('#worldMap') || rect('#networkMap'),
    leaflet: !!document.querySelector('.leaflet-container'),
    tilesLoaded: (() => { const t = [...document.querySelectorAll('.leaflet-tile')]; return t.length > 0 ? t.every(x => x.complete && x.naturalWidth > 0) : null; })(),
    grid: grid ? { css: [grid.clientWidth, grid.clientHeight], buf: [grid.width, grid.height] } : null,
    globeCv: globeCv ? { css: [globeCv.clientWidth, globeCv.clientHeight], buf: [globeCv.width, globeCv.height] } : null,
    globeReady: !!window.__globeReady,
    globeFallbackVisible: (() => { const f = document.querySelector('.globe-fallback'); return f ? getComputedStyle(f).display !== 'none' : null; })(),
    homeLoaded: document.body.classList.contains('loaded'),
    deviceMap: !!window.deviceMap,
    deviceMarker: !!window.deviceMarker,
    markerScreen: (() => {
      if (!window.deviceMap || !window.deviceMarker) return null;
      const p = window.deviceMap.latLngToContainerPoint(window.deviceMarker.getLatLng());
      return [Math.round(p.x), Math.round(p.y)];
    })(),
    coreScreen: (() => { const el = document.querySelector('.gps-core, .loc-core'); if (!el) return null; const r = el.getBoundingClientRect(); const m = window.deviceMap && document.querySelector('#worldMap') ? document.querySelector('#worldMap').getBoundingClientRect() : null; return m ? [Math.round(r.left - m.left + r.width / 2), Math.round(r.top - m.top + r.height / 2)] : null; })()
  };
})()`;

const keyPages = ['index.html', 'network.html', 'location.html', 'dashboard.html', 'dashboard-a02.html', 'dashboard-a03.html'];
const allPages = [...keyPages, 'sensors.html', 'telemetry.html', 'hardware.html', 'analysis.html',
  'location-a02.html', 'location-a03.html', 'sensors-a02.html', 'sensors-a03.html',
  'telemetry-a02.html', 'telemetry-a03.html', 'hardware-a02.html', 'hardware-a03.html',
  'analysis-a02.html', 'analysis-a03.html', 'a02.html'];

const results = {};

async function scan(p, w, h, dsf = 1, mobile = false, shot = null) {
  collectedErrors.length = 0;
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: dsf, mobile });
  await nav('http://127.0.0.1:8765/' + p + '?v=' + Date.now(), p === 'index.html' ? 3000 : 2200);
  await evalJs(`window.anxApplyLang && window.anxApplyLang('zh')`);
  await wait(400);
  const m = await evalJs(metricJs);
  if (shot) await capture('./compatibility_screenshots/' + shot);
  return { page: p, viewport: [w, h], dsf, errors: [...new Set(collectedErrors)], metric: m };
}

// ---- 1) 平板 1024×1366（全部页面）+ 截图（关键 7 页）----
for (const p of allPages) {
  results['1024_' + p] = await scan(p, 1024, 1366, 1, false, keyPages.includes(p) ? p.replace('.html', '') + '-chrome-1024x1366.png' : null);
}

// ---- 2) 移动端 375×812（关键 7 页）----
for (const p of keyPages) {
  results['375_' + p] = await scan(p, 375, 812, 1, true, null);
}

// ---- 3) DPR 矩阵（关键 7 页 × 1920×1080，DPR 1/1.25/1.5/2/3）----
for (const d of [1, 1.25, 1.5, 2, 3]) {
  for (const p of keyPages) {
    results['dpr' + d + '_' + p] = await scan(p, 1920, 1080, d, false, null);
  }
}
// 移动端高 DPR：首页/地图页 390×844 @2、@3
for (const d of [2, 3]) {
  for (const p of ['index.html', 'network.html', 'dashboard.html', 'dashboard-a02.html']) {
    results['mobiledpr' + d + '_' + p] = await scan(p, 390, 844, d, true, null);
  }
}

// ---- 4) 浏览器缩放 100/110/125/150（1366×768 物理，关键 7 页）----
for (const pct of [100, 110, 125, 150]) {
  const w = Math.round(1366 / (pct / 100));
  const h = Math.round(768 / (pct / 100));
  for (const p of keyPages) {
    results['zoom' + pct + '_' + p] = await scan(p, w, h, pct / 100, false, null);
  }
}

// ---- 5) WebGL 不可用模拟：WebGLRenderer 抛错 → 静态降级，页面不白屏 ----
await send('Page.addScriptToEvaluateOnNewDocument', { source: `(function(){ try { var orig = THREE && THREE.WebGLRenderer; if (orig) THREE.WebGLRenderer = function(){ throw new Error('webgl-sim-disabled'); }; } catch(e){} })();` });
results.webglSim = await scan('index.html', 1920, 1080, 1, false, null);
await send('Page.addScriptToEvaluateOnNewDocument', { source: `(function(){ try { delete window.THREE; delete window.ThreeGlobe; } catch(e){} })();` });
await send('Page.navigate', { url: 'http://127.0.0.1:8765/index.html?v=' + Date.now() });
await wait(6500);
results.cdnFallbackSim = await evalJs(metricJs);
// 清除注入脚本，恢复真实环境
await send('Page.addScriptToEvaluateOnNewDocument', { source: `(function(){})();` });

// ---- 6) 地图 resize：网格始终铺满、A01 节点不跑位 ----
const mapPages = ['network.html', 'location.html', 'dashboard.html', 'dashboard-a02.html'];
for (const p of mapPages) {
  const steps = [];
  for (const [w, h] of [[1920, 1080], [1280, 720], [1920, 1080]]) {
    collectedErrors.length = 0;
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
    if (steps.length === 0) {
      await nav('http://127.0.0.1:8765/' + p + '?v=' + Date.now(), 2600);
    } else {
      await wait(1200);
    }
    const m = await evalJs(metricJs);
    steps.push({ vp: [w, h], metric: m });
  }
  results['resize_' + p] = steps;
}

// ---- 7) 逐页刷新（直链打开 + reload 后语言/状态保持）----
for (const p of allPages) {
  collectedErrors.length = 0;
  await send('Emulation.setDeviceMetricsOverride', { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
  await nav('http://127.0.0.1:8765/' + p + '?v=' + Date.now(), p === 'index.html' ? 3000 : 2200);
  await evalJs(`window.anxApplyLang && window.anxApplyLang('zh')`);
  await wait(300);
  await send('Page.reload', { ignoreCache: true });
  await wait(p === 'index.html' ? 3000 : 2200);
  const m = await evalJs(metricJs);
  results['reload_' + p] = { errors: [...new Set(collectedErrors)], metric: m };
}

writeFileSync(new URL('./v481_audit_raw.json', import.meta.url), JSON.stringify(results, null, 2));
console.log('scans:', Object.keys(results).length);
ws.close();
