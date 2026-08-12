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
    errors.push((msg.params.exceptionDetails.exception && msg.params.exceptionDetails.exception.description || msg.params.exceptionDetails.text || '').split('\n')[0].slice(0, 220));
  }
};

await new Promise((resolve, reject) => {
  ws.onopen = resolve;
  ws.onerror = reject;
});
await send('Runtime.enable');
await send('Network.enable');
await send('Network.setCacheDisabled', { cacheDisabled: true });

async function evalJs(expression) {
  const res = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  return res.result ? res.result.value : null;
}
const wait = ms => new Promise(r => setTimeout(r, ms));
const out = {};

// 1) 1024×1366 瓦片加载复核（等待 6 秒）
await send('Emulation.setDeviceMetricsOverride', { width: 1024, height: 1366, deviceScaleFactor: 1, mobile: false });
for (const p of ['network.html', 'location.html']) {
  errors.length = 0;
  await send('Page.navigate', { url: 'http://127.0.0.1:8765/' + p + '?v=' + Date.now() });
  await wait(6000);
  out['tiles_' + p] = await evalJs(`(() => {
    const t = [...document.querySelectorAll('.leaflet-tile')];
    return { count: t.length, loaded: t.length > 0 ? t.every(x => x.complete && x.naturalWidth > 0) : null, errors: null };
  })()`);
  out['tiles_' + p].errors = [...errors];
}

// 2) index dpr1.25 复核
await send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1.25, mobile: false });
errors.length = 0;
await send('Page.navigate', { url: 'http://127.0.0.1:8765/index.html?v=' + Date.now() });
await wait(4000);
out.dpr125 = await evalJs(`(() => {
  const cv = document.querySelector('#globe3d canvas');
  return {
    ready: !!window.__globeReady,
    bodyLoaded: document.body ? document.body.classList.contains('loaded') : null,
    canvas: cv ? [cv.width, cv.height, cv.clientWidth, cv.clientHeight] : null,
    dpr: window.devicePixelRatio
  };
})()`);
out.dpr125.errors = [...errors];

// 3) WebGL 不可用模拟（在 THREE 加载后拦截 WebGLRenderer）
await send('Page.addScriptToEvaluateOnNewDocument', { source: `(function(){
  var iv = setInterval(function(){
    if (window.THREE && THREE.WebGLRenderer) {
      clearInterval(iv);
      THREE.WebGLRenderer = function(){ throw new Error('webgl-sim-disabled'); };
    }
  }, 5);
})();` });
errors.length = 0;
await send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: 'http://127.0.0.1:8765/index.html?v=' + Date.now() });
await wait(3500);
out.webglSim = await evalJs(`(() => {
  const f = document.querySelector('.globe-fallback');
  return {
    fallbackVisible: f ? getComputedStyle(f).display !== 'none' : null,
    bodyLoaded: document.body.classList.contains('loaded'),
    heroOpacity: getComputedStyle(document.querySelector('.hero')).opacity,
    globeCanvas: !!document.querySelector('#globe3d canvas')
  };
})()`);
out.webglSim.errors = [...errors];

// 4) CDN 失败模拟：拦截 unpkg，验证 jsdelivr 备用加载
await send('Network.setBlockedURLs', { urls: ['*://unpkg.com/*'] });
errors.length = 0;
await send('Page.navigate', { url: 'http://127.0.0.1:8765/index.html?v=' + Date.now() });
await wait(8000);
out.cdnSim = await evalJs(`(() => ({
  globeReady: !!window.__globeReady,
  fallbackVisible: (() => { const f = document.querySelector('.globe-fallback'); return f ? getComputedStyle(f).display !== 'none' : null; })(),
  bodyLoaded: document.body.classList.contains('loaded'),
  resources: performance.getEntriesByType('resource').map(e => e.name.split('/').slice(-2).join('/')).filter(n => n.includes('three'))
}))()`);
out.cdnSim.errors = [...errors];
await send('Network.setBlockedURLs', { urls: [] });

// 5) Network 地图节点 resize 后位置复核
await send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: 'http://127.0.0.1:8765/network.html?v=' + Date.now() });
await wait(2500);
const netBefore = await evalJs(`(() => {
  const m = document.querySelector('#networkMap .net-marker.active, #networkMap .net-marker');
  const r = m ? m.getBoundingClientRect() : null;
  const box = document.querySelector('#networkMap').getBoundingClientRect();
  return r ? { x: Math.round(r.left - box.left + r.width / 2), y: Math.round(r.top - box.top + r.height / 2), inside: r.left >= box.left && r.right <= box.right && r.top >= box.top && r.bottom <= box.bottom } : null;
})()`);
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
await wait(1500);
const netAfter = await evalJs(`(() => {
  const m = document.querySelector('#networkMap .net-marker.active, #networkMap .net-marker');
  const r = m ? m.getBoundingClientRect() : null;
  const box = document.querySelector('#networkMap').getBoundingClientRect();
  return r ? { x: Math.round(r.left - box.left + r.width / 2), y: Math.round(r.top - box.top + r.height / 2), inside: r.left >= box.left && r.right <= box.right && r.top >= box.top && r.bottom <= box.bottom } : null;
})()`);
out.networkMarkerResize = { before: netBefore, after: netAfter };

writeFileSync(new URL('./v481_recheck.json', import.meta.url), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
ws.close();
