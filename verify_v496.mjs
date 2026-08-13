import { writeFileSync, mkdirSync } from 'node:fs';

mkdirSync(new URL('./v49_6_screenshots/', import.meta.url), { recursive: true });

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
  }
};

await new Promise((resolve, reject) => {
  ws.onopen = resolve;
  ws.onerror = reject;
});
await send('Runtime.enable');
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

const infoJs = `(() => {
  const cv = document.querySelector('#globe3d canvas');
  let region = null;
  if (window.__globe && window.__camera) {
    try {
      const g = window.__globe, cam = window.__camera;
      g.updateMatrixWorld();
      const c = g.position.clone().project(cam);
      const rw = 100 * g.scale.x;
      const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0).normalize();
      const e = g.position.clone().add(right.multiplyScalar(rw)).project(cam);
      const cx = (c.x * 0.5 + 0.5) * innerWidth;
      const cy = (-c.y * 0.5 + 0.5) * innerHeight;
      const r = Math.abs(e.x - c.x) * innerWidth / 2;
      region = { cx: Math.round(cx), cy: Math.round(cy), r: Math.round(r) };
    } catch (err) {}
  }
  return {
    ready: !!window.__globeReady,
    earthTexW: window.__earthTexW || null,
    earthLand: window.__earthLand || 0,
    canvas: cv ? [cv.width, cv.height] : null,
    dpr: window.devicePixelRatio || 1,
    region
  };
})()`;

const out = {};
for (const [w, h, dsf, name] of [[1920, 1080, 1, '1920x1080'], [2560, 1440, 1, '2560x1440'], [1366, 768, 1, '1366x768'], [390, 844, 1, '390x844']]) {
  errors.length = 0;
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: dsf, mobile: w < 600 });
  await send('Page.navigate', { url: 'http://127.0.0.1:8765/index.html?v=' + Date.now() });
  await wait(w < 600 ? 8000 : 12000);
  const m = await evalJs(infoJs);
  m.errors = [...errors];
  out[name] = m;
  await capture('./v49_6_screenshots/index-' + name + '.png');
}

writeFileSync(new URL('./v496_check.json', import.meta.url), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
ws.close();
