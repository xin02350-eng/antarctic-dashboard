import { writeFileSync, mkdirSync } from 'node:fs';

mkdirSync(new URL('./v49_16_screenshots/', import.meta.url), { recursive: true });

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
    if (msg.error) reject(new Error(JSON.stringify(msg.error)));
    else resolve(msg.result);
  } else if (msg.method === 'Runtime.exceptionThrown') {
    errors.push((msg.params.exceptionDetails.exception && msg.params.exceptionDetails.exception.description || msg.params.exceptionDetails.text || '').split('\n')[0]);
  } else if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') {
    errors.push('LOG: ' + msg.params.entry.text.slice(0, 220));
  }
};

await new Promise((resolve, reject) => {
  ws.onopen = resolve;
  ws.onerror = reject;
});
await send('Runtime.enable');
await send('Log.enable');
await send('Network.setCacheDisabled', { cacheDisabled: true });

async function evalJs(expression) {
  const res = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  return res.result ? res.result.value : null;
}
const wait = ms => new Promise(r => setTimeout(r, ms));
async function capture(file) {
  const res = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  writeFileSync(new URL('./v49_16_screenshots/' + file, import.meta.url), Buffer.from(res.data, 'base64'));
}

const probe = `(() => {
  const g = window.__globe;
  const cv = window.__lineCv;
  let hist = null;
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
          if (a > 20 && r > 235 && gg > 245 && b > 250) ice++;
          if (r > 225 && gg > 235 && b > 245) white++;
          if (b > 160 && b > r + 50 && gg > 100) blue++;
        }
      }
      hist = { samples: n, ice, white, blue };
    } catch (e) { hist = { err: String(e) }; }
  }
  return {
    ready: !!window.__globeReady,
    globe: !!g,
    rotationY: g ? +g.rotation.y.toFixed(4) : null,
    landGJ: !!window.__landGJ,
    earthLand: window.__earthLand,
    geoLineFeats: (window.__geoLineFeats || []).length,
    riverFeats: (window.__riverFeats || []).length,
    landFeats: (window.__landFeats || []).length,
    texW: window.__earthTexW || (cv && cv.width) || 0,
    lineCv: cv ? [cv.width, cv.height] : null,
    hist,
    labels: !!window.__globeLabels,
    leaderCv: !!document.getElementById('leaderCv'),
    anLabel: !!document.querySelector('.an-label'),
    scroll: [document.documentElement.scrollWidth, document.documentElement.clientWidth],
    lang: window.anxCurrentLang
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
  // Freeze at the China-facing orientation right before capture (drift over ~100ms is negligible).
  await evalJs('if (window.__globe) window.__globe.rotation.y = 0.6; if (window.anxApplyLang) window.anxApplyLang(' + JSON.stringify(lang) + '); true');
  await wait(300);
  const m = await evalJs(probe);
  m.errors = [...errors];
  m.resolution = w + 'x' + h;
  out[file] = m;
  await capture(file);
  console.log(file, JSON.stringify(m));
}

writeFileSync(new URL('./v4916_check.json', import.meta.url), JSON.stringify(out, null, 2));
ws.close();
