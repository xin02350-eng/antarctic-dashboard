import { writeFileSync, mkdirSync } from 'node:fs';

mkdirSync(new URL('./v49_17_screenshots/', import.meta.url), { recursive: true });

const list = await fetch('http://127.0.0.1:9222/json/list').then(r => r.json());
const page = list.find(t => t.type === 'page');
if (!page) throw new Error('page target not found');

const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
let errors = [];

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
    msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
  } else if (msg.method === 'Runtime.exceptionThrown') {
    errors.push((msg.params.exceptionDetails.exception && msg.params.exceptionDetails.exception.description || msg.params.exceptionDetails.text || '').split('\n')[0]);
  } else if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') {
    errors.push('LOG: ' + msg.params.entry.text.slice(0, 220));
  }
};

await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
await send('Runtime.enable');
await send('Log.enable');
await send('Network.setCacheDisabled', { cacheDisabled: true });

const evalJs = async (e) => (await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true })).result.value;
const wait = ms => new Promise(r => setTimeout(r, ms));
async function capture(file) {
  const res = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  writeFileSync(new URL('./v49_17_screenshots/' + file, import.meta.url), Buffer.from(res.data, 'base64'));
}

const probe = `(() => {
  const g = window.__globe;
  const cv = window.__lineCv;
  let earth = null;
  if (cv) {
    try {
      const ctx = cv.getContext('2d');
      const img = ctx.getImageData(0, 0, cv.width, cv.height).data;
      let ice = 0, blue = 0, white = 0, n = 0;
      const step = 8;
      for (let y = 0; y < cv.height; y += step) {
        for (let x = 0; x < cv.width; x += step) {
          const i = (y * cv.width + x) * 4;
          const r = img[i], gg = img[i+1], b = img[i+2], a = img[i+3];
          n++;
          if (a > 20 && r > 215 && gg > 235 && b > 240) white++;
          if (b > 160 && b > r + 50 && gg > 100) blue++;
        }
      }
      earth = { n, white, blue };
    } catch (e) { earth = { err: String(e) }; }
  }
  const lc = document.getElementById('leaderCv');
  let markers = null;
  if (lc) {
    const ctx = lc.getContext('2d');
    const img = ctx.getImageData(0, 0, lc.width, lc.height).data;
    let cyan = 0, white = 0, n = 0;
    const step = 3;
    for (let y = 0; y < lc.height; y += step) {
      for (let x = 0; x < lc.width; x += step) {
        const i = (y * lc.width + x) * 4;
        const r = img[i], gg = img[i+1], b = img[i+2], a = img[i+3];
        n++;
        if (a > 20 && gg > 150 && b > 150 && r < 200) cyan++;
        if (a > 20 && r > 230 && gg > 245 && b > 248) white++;
      }
    }
    markers = { cv: [lc.width, lc.height], n, cyan, white };
  }
  return {
    ready: !!window.__globeReady,
    rotationY: g ? +g.rotation.y.toFixed(4) : null,
    earth: {
      landGJ: !!window.__landGJ,
      earthLand: window.__earthLand,
      geoLineFeats: (window.__geoLineFeats || []).length,
      riverFeats: (window.__riverFeats || []).length,
      texW: window.__earthTexW || (cv && cv.width) || 0
    },
    earthHist: earth,
    markers,
    labels: window.__globeLabels,
    labelLang: window.__labelLang,
    scroll: [document.documentElement.scrollWidth, document.documentElement.clientWidth]
  };
})()`;

const out = {};
const cases = [
  [1920, 1080, 'zh', 'index-1920x1080-zh.png'],
  [1920, 1080, 'en', 'index-1920x1080-en.png'],
  [1366, 768, 'zh', 'index-1366x768-zh.png'],
  [2560, 1440, 'zh', 'index-2560x1440-zh.png']
];

for (const [w, h, lang, file] of cases) {
  errors.length = 0;
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: 'http://127.0.0.1:8765/index.html?v=' + Date.now() });
  await wait(9000);
  await evalJs('if (window.__globe) window.__globe.rotation.y = 0.6; if (window.anxApplyLang) window.anxApplyLang(' + JSON.stringify(lang) + '); true');
  await wait(300);
  const m = await evalJs(probe);
  m.errors = [...errors];
  m.resolution = w + 'x' + h;
  out[file] = m;
  await capture(file);
  console.log(file, JSON.stringify(m));
}

writeFileSync(new URL('./v4917_check.json', import.meta.url), JSON.stringify(out, null, 2));
ws.close();
