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

async function nav(url) {
  await send('Page.navigate', { url });
  await wait(2800);
}

async function capture(file) {
  const res = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  writeFileSync(new URL(file, import.meta.url), Buffer.from(res.data, 'base64'));
}

await send('Network.setCacheDisabled', { cacheDisabled: true });

const pages = [
  'index.html', 'network.html', 'dashboard.html', 'location.html',
  'sensors.html', 'telemetry.html', 'hardware.html', 'analysis.html',
  'dashboard-a02.html', 'dashboard-a03.html',
  'location-a02.html', 'location-a03.html', 'sensors-a02.html', 'sensors-a03.html',
  'telemetry-a02.html', 'telemetry-a03.html', 'hardware-a02.html', 'hardware-a03.html',
  'analysis-a02.html', 'analysis-a03.html', 'a02.html'
];

const check = `(() => {
  const sw = document.querySelector('.lang-switch');
  const float = document.querySelector('.lang-float');
  const sr = sw ? sw.getBoundingClientRect() : null;
  const hr = document.querySelector('.header-right') ? document.querySelector('.header-right').getBoundingClientRect() : null;
  const overlap = sr && hr ? !(sr.right <= hr.left || sr.left >= hr.right || sr.bottom <= hr.top || sr.top >= hr.bottom) : false;
  const zoom = [...document.querySelectorAll('.lang-switch')].length;
  return {
    url: location.pathname.split('/').pop(),
    viewport: [window.innerWidth, window.innerHeight],
    switchCount: zoom,
    hasFloat: !!float,
    swRect: sr ? [Math.round(sr.left), Math.round(sr.top), Math.round(sr.right), Math.round(sr.bottom)] : null,
    rightGap: sr ? Math.round(window.innerWidth - sr.right) : null,
    topGap: sr ? Math.round(sr.top) : null,
    overlapHeaderRight: overlap,
    hOverflow: document.documentElement.scrollWidth > window.innerWidth
  };
})()`;

const out = {};
for (const p of pages) {
  await send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
  await nav('http://127.0.0.1:8765/' + p + '?v=' + Date.now());
  await evalJs(`window.anxApplyLang && window.anxApplyLang('zh')`);
  await wait(500);
  out[p + '@1920'] = await evalJs(check);
  await capture('./v47_32/' + p.replace('.html', '') + '-1920x1080.png');
}

for (const p of pages) {
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await nav('http://127.0.0.1:8765/' + p + '?v=' + Date.now());
  await evalJs(`window.anxApplyLang && window.anxApplyLang('zh')`);
  await wait(500);
  out[p + '@390'] = await evalJs(check);
  await capture('./v47_32/' + p.replace('.html', '') + '-390x844.png');
}

for (const [w, h] of [[1366, 768], [1024, 1366]]) {
  for (const p of pages) {
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
    await nav('http://127.0.0.1:8765/' + p + '?v=' + Date.now());
    await evalJs(`window.anxApplyLang && window.anxApplyLang('zh')`);
    await wait(400);
    out[p + '@' + w] = await evalJs(check);
  }
}

writeFileSync(new URL('./v47_32/measurements.json', import.meta.url), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
ws.close();
