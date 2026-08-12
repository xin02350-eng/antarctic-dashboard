import { writeFileSync, mkdirSync } from 'node:fs';

mkdirSync(new URL('./final_compatibility_screenshots/Flow/', import.meta.url), { recursive: true });

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
await send('Page.enable');
await send('Network.setCacheDisabled', { cacheDisabled: true });

async function evalJs(expression) {
  const res = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  return res.result ? res.result.value : null;
}
const wait = ms => new Promise(r => setTimeout(r, ms));
async function capture(file) {
  const res = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  writeFileSync(new URL(file, import.meta.url), Buffer.from(res.data, 'base64'));
}

const out = {};

// ============ 1) 教师现场演示全流程 ============
await send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
const flow = ['index.html', 'network.html', 'location.html', 'dashboard.html', 'dashboard-a02.html', 'dashboard-a03.html'];
const flowSteps = [];
for (let i = 0; i < flow.length; i++) {
  collectedErrors.length = 0;
  await send('Page.navigate', { url: 'http://127.0.0.1:8765/' + flow[i] + '?v=' + Date.now() });
  await wait(flow[i] === 'index.html' ? 3200 : 2600);
  await evalJs(`window.anxApplyLang && window.anxApplyLang('zh')`);
  await wait(400);
  const m = await evalJs(`(() => ({
    url: location.pathname.split('/').pop(),
    ready: ${flow[i] === 'index.html' ? '!!window.__globeReady' : 'true'},
    fallback: (() => { const f = document.querySelector('.globe-fallback'); return f ? getComputedStyle(f).display !== 'none' : null; })(),
    map: !!window.deviceMap || !!document.querySelector('.leaflet-container'),
    marker: !!window.deviceMarker || !!document.querySelector('.net-marker'),
    cmd: document.querySelectorAll('.cmd-cell').length,
    scroll: [document.documentElement.scrollWidth, document.documentElement.scrollHeight, document.documentElement.clientWidth, document.documentElement.clientHeight],
    lang: document.documentElement.getAttribute('lang'),
    title: document.title
  }))()`);
  flowSteps.push({ step: i + 1, page: flow[i], m, errors: [...new Set(collectedErrors)] });
  await capture('./final_compatibility_screenshots/Flow/step' + (i + 1) + '_' + flow[i].replace('.html', '') + '.png');
}
out.teacherFlow = flowSteps;

// 语言切换（首页 → EN → 中文）
collectedErrors.length = 0;
await send('Page.navigate', { url: 'http://127.0.0.1:8765/index.html?v=' + Date.now() });
await wait(3000);
await evalJs(`window.anxApplyLang && window.anxApplyLang('en')`);
await wait(500);
const langEn = await evalJs(`({ lang: document.documentElement.getAttribute('lang'), title: document.title, brand: document.querySelector('.brand h1') ? document.querySelector('.brand h1').textContent.replace(/\\s+/g,' ').trim() : null })`);
await evalJs(`window.anxApplyLang && window.anxApplyLang('zh')`);
await wait(500);
const langZh = await evalJs(`({ lang: document.documentElement.getAttribute('lang'), title: document.title, brand: document.querySelector('.brand h1') ? document.querySelector('.brand h1').textContent.replace(/\\s+/g,' ').trim() : null })`);
out.langToggle = { en: langEn, zh: langZh, errors: [...new Set(collectedErrors)] };

// 返回链
const backSteps = [];
for (let i = 0; i < 5; i++) {
  collectedErrors.length = 0;
  await evalJs('history.back()');
  await wait(1800);
  backSteps.push({ url: await evalJs('location.pathname.split("/").pop()'), errors: [...new Set(collectedErrors)] });
}
out.backChain = backSteps;

// 刷新
collectedErrors.length = 0;
await send('Page.navigate', { url: 'http://127.0.0.1:8765/dashboard.html?v=' + Date.now() });
await wait(2600);
await evalJs(`window.anxApplyLang && window.anxApplyLang('zh')`);
await wait(300);
await send('Page.reload', { ignoreCache: true });
await wait(2600);
out.refresh = { url: await evalJs('location.pathname.split("/").pop()'), lang: await evalJs('document.documentElement.getAttribute("lang")'), title: await evalJs('document.title'), map: await evalJs('!!window.deviceMap'), errors: [...new Set(collectedErrors)] };

// 窗口最大化 → 缩小 → 恢复（首页地球）
const resizeSteps = [];
for (const [w, h] of [[1920, 1080], [1100, 700], [1920, 1080]]) {
  collectedErrors.length = 0;
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
  await wait(1800);
  const m = await evalJs(`(() => {
    const cv = document.querySelector('#globe3d canvas');
    return { vp: [innerWidth, innerHeight], globeReady: !!window.__globeReady, canvas: cv ? [cv.width, cv.height] : null, scroll: [document.documentElement.scrollWidth, document.documentElement.scrollHeight] };
  })()`);
  resizeSteps.push({ vp: [w, h], m, errors: [...new Set(collectedErrors)] });
}
out.indexResize = resizeSteps;

// 地图 resize：Dashboard 网格铺满 + 节点不跑位
const mapSteps = [];
for (const [w, h] of [[1920, 1080], [1280, 720], [1920, 1080]]) {
  collectedErrors.length = 0;
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
  if (mapSteps.length === 0) {
    await send('Page.navigate', { url: 'http://127.0.0.1:8765/dashboard.html?v=' + Date.now() });
    await wait(3000);
  } else {
    await wait(1500);
  }
  const m = await evalJs(`(() => {
    const g = document.getElementById('mapGraticule');
    const ok = g ? Math.abs(g.clientWidth - g.width / Math.min(devicePixelRatio || 1, 1.5)) < 2 && Math.abs(g.clientHeight - g.height / Math.min(devicePixelRatio || 1, 1.5)) < 2 : null;
    let diff = null;
    if (window.deviceMap && window.deviceMarker) {
      const p = window.deviceMap.latLngToContainerPoint(window.deviceMarker.getLatLng());
      const core = document.querySelector('.gps-core');
      const cr = core.getBoundingClientRect();
      const wr = document.querySelector('#worldMap').getBoundingClientRect();
      diff = [Math.round(Math.abs(p.x - (cr.left - wr.left + cr.width / 2))), Math.round(Math.abs(p.y - (cr.top - wr.top + cr.height / 2)))];
    }
    return { vp: [innerWidth, innerHeight], gridOK: ok, gridCss: g ? [g.clientWidth, g.clientHeight] : null, gridBuf: g ? [g.width, g.height] : null, markerDiff: diff, map: !!window.deviceMap };
  })()`);
  mapSteps.push({ m, errors: [...new Set(collectedErrors)] });
}
out.dashboardResize = mapSteps;

// ============ 2) 专项复核 ============

// 2a) Network Coming Soon 徽标文字居中
await send('Emulation.setDeviceMetricsOverride', { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: 'http://127.0.0.1:8765/network.html?v=' + Date.now() });
await wait(2600);
out.networkBadges = await evalJs(`(() => {
  return [...document.querySelectorAll('.badge.soon')].map(b => {
    const br = b.getBoundingClientRect();
    const spans = [...b.querySelectorAll('span')].filter(s => s.getBoundingClientRect().width > 0);
    const centers = spans.map(s => { const r = s.getBoundingClientRect(); return [Math.round((r.left + r.right) / 2), Math.round((r.top + r.bottom) / 2)]; });
    return { box: [Math.round(br.left), Math.round(br.top), Math.round(br.right), Math.round(br.bottom)], centers };
  });
})()`);

// 2b) A01/A02/A03 模板一致性（1366×768 与 1024×1366）
const parity = {};
for (const [w, h] of [[1366, 768], [1024, 1366]]) {
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
  for (const p of ['dashboard.html', 'dashboard-a02.html', 'dashboard-a03.html']) {
    await send('Page.navigate', { url: 'http://127.0.0.1:8765/' + p + '?v=' + Date.now() });
    await wait(2600);
    await evalJs(`window.anxApplyLang && window.anxApplyLang('zh')`);
    await wait(300);
    parity[p + '@' + w] = await evalJs(`(() => {
      const rect = sel => { const el = document.querySelector(sel); if (!el) return null; const r = el.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom), Math.round(r.width), Math.round(r.height)]; };
      return { header: rect('.mission-header'), cmd: rect('.dashboard-command-strip'), map: rect('.map-panel'), lang: rect('.lang-switch'), cells: [...document.querySelectorAll('.cmd-cell')].map(c => { const r = c.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)]; }) };
    })()`);
  }
}
out.terminalParity = parity;

// 2c) WebGL 不可用模拟（注入拦截，验证静态降级）
const inj = await send('Page.addScriptToEvaluateOnNewDocument', { source: `(function(){
  var iv = setInterval(function(){
    if (window.THREE && THREE.WebGLRenderer) {
      clearInterval(iv);
      THREE.WebGLRenderer = function(){ throw new Error('webgl-sim-disabled'); };
    }
  }, 1);
})();` });
collectedErrors.length = 0;
await send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: 'http://127.0.0.1:8765/index.html?v=' + Date.now() });
await wait(3500);
out.webglSim = await evalJs(`(() => {
  const f = document.querySelector('.globe-fallback');
  return { fallback: f ? getComputedStyle(f).display !== 'none' : null, loaded: document.body.classList.contains('loaded'), heroOpacity: getComputedStyle(document.querySelector('.hero')).opacity, canvas: !!document.querySelector('#globe3d canvas') };
})()`);
out.webglSim.errors = [...new Set(collectedErrors)];
await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: inj.identifier });
await send('Page.navigate', { url: 'http://127.0.0.1:8765/index.html?v=' + Date.now() });
await wait(3200);
out.webglRestored = await evalJs(`({ ready: !!window.__globeReady, canvas: !!document.querySelector('#globe3d canvas'), fallback: (() => { const f = document.querySelector('.globe-fallback'); return f ? getComputedStyle(f).display !== 'none' : null; })() })`);

// 2d) 复扫：两处竞态 + 大视口/高 DPR 瓦片（加长等待）
for (const [p, w, h, dsf, lang] of [
  ['index.html', 1920, 1080, 1.25, 'zh'],
  ['index.html', 1920, 1080, 1, 'en'],
  ['network.html', 3840, 2160, 1, 'zh'],
  ['location.html', 3840, 2160, 1, 'zh'],
  ['network.html', 1920, 1080, 1.25, 'zh'],
  ['network.html', 1920, 1080, 1.5, 'zh']
]) {
  collectedErrors.length = 0;
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: dsf, mobile: false });
  await send('Page.navigate', { url: 'http://127.0.0.1:8765/' + p + '?v=' + Date.now() });
  await wait(p === 'index.html' ? 4500 : 6000);
  await evalJs(`window.anxApplyLang && window.anxApplyLang(${JSON.stringify(lang)})`);
  await wait(500);
  out['rescan_' + p + '@' + w + 'd' + dsf + lang] = await evalJs(`(() => {
    const t = [...document.querySelectorAll('.leaflet-tile')];
    return {
      url: location.pathname.split('/').pop(),
      lang: document.documentElement.getAttribute('lang'),
      title: document.title,
      globeReady: !!window.__globeReady,
      fallback: (() => { const f = document.querySelector('.globe-fallback'); return f ? getComputedStyle(f).display !== 'none' : null; })(),
      langRect: (() => { const l = document.querySelector('.lang-switch'); const r = l ? l.getBoundingClientRect() : null; return r ? [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)] : null; })(),
      tiles: t.length,
      tilesLoaded: t.length > 0 ? t.every(x => x.complete && x.naturalWidth > 0) : null,
      scroll: [document.documentElement.scrollWidth, document.documentElement.scrollHeight, document.documentElement.clientWidth, document.documentElement.clientHeight]
    };
  })()`);
  out['rescan_' + p + '@' + w + 'd' + dsf + lang].errors = [...new Set(collectedErrors)];
}

writeFileSync(new URL('./v490_audit_b.json', import.meta.url), JSON.stringify(out, null, 2));
console.log('done');
ws.close();
