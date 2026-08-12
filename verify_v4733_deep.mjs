import { writeFileSync } from 'node:fs';

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
const deepCheck = `(async () => {
  const styleOf = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const cs = getComputedStyle(el);
    return {
      font: cs.fontFamily.split(',')[0].trim(),
      size: cs.fontSize,
      letterSpacing: cs.letterSpacing,
      border: cs.borderColor + ' ' + cs.borderWidth + ' ' + cs.borderStyle,
      radius: cs.borderRadius,
      bg: cs.backgroundImage !== 'none' ? cs.backgroundImage.slice(0, 90) : cs.backgroundColor,
      color: cs.color
    };
  };
  const canvas = document.getElementById('mapGraticule');
  let gridPixels = 0;
  if (canvas) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    if (w && h) {
      const img = ctx.getImageData(0, 0, w, h).data;
      for (let i = 3; i < img.length; i += 4) if (img[i] > 0) gridPixels++;
    }
  }
  const tiles = [...document.querySelectorAll('.leaflet-tile')];
  const tilesLoaded = tiles.length > 0 && tiles.every(t => t.complete && t.naturalWidth > 0);
  return {
    errors: window.__anxErrors || [],
    gridPixels,
    canvasSize: canvas ? [canvas.width, canvas.height] : null,
    tiles: tiles.length,
    tilesLoaded,
    lat: document.getElementById('latitude') ? document.getElementById('latitude').textContent.trim() : null,
    marker: !!window.deviceMarker,
    mapCenter: window.deviceMap ? window.deviceMap.getCenter() : null,
    mapZoom: window.deviceMap ? window.deviceMap.getZoom() : null,
    langSwitchStyle: styleOf('.lang-switch'),
    cmdCellStyle: styleOf('.cmd-cell'),
    mapPanelStyle: styleOf('.map-panel'),
    sideRightVisible: (() => { const el = document.querySelector('.side-right'); return el ? getComputedStyle(el).display : null; })(),
    streamRows: [...document.querySelectorAll('.stream-row')].map(r => r.textContent.replace(/\\s+/g, ' ').trim())
  };
})()`;

const inject = `(() => {
  window.__anxErrors = [];
  window.addEventListener('error', function (e) { window.__anxErrors.push('error: ' + e.message); });
  window.addEventListener('unhandledrejection', function (e) { window.__anxErrors.push('rejection: ' + (e.reason && e.reason.message ? e.reason.message : String(e.reason))); });
})();`;

await send('Page.addScriptToEvaluateOnNewDocument', { source: inject });
await send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });

const out = {};
for (const p of ['dashboard.html', 'dashboard-a02.html', 'dashboard-a03.html']) {
  await send('Page.navigate', { url: 'http://127.0.0.1:8765/' + p + '?v=' + Date.now() });
  await wait(3500);
  await evalJs(`window.anxApplyLang && window.anxApplyLang('zh')`);
  await wait(500);
  out[p] = await evalJs(deepCheck);
}

writeFileSync(new URL('./v47_33_screenshots/deep.json', import.meta.url), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
ws.close();
