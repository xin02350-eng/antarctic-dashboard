import { writeFileSync, mkdirSync } from 'node:fs';

mkdirSync(new URL('./v49_4_screenshots/', import.meta.url), { recursive: true });

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
  if (res.exceptionDetails) return { __evalError: (res.exceptionDetails.exception && res.exceptionDetails.exception.description || res.exceptionDetails.text || '').split('\n')[0] };
  return res.result.value;
}
const wait = ms => new Promise(r => setTimeout(r, ms));
async function capture(file) {
  const res = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  writeFileSync(new URL(file, import.meta.url), Buffer.from(res.data, 'base64'));
}

const metricJs = `(() => {
  const cv = document.querySelector('#globe3d canvas');
  const info = {
    ready: !!window.__globeReady,
    earthTexW: window.__earthTexW || null,
    canvas: cv ? [cv.width, cv.height, cv.clientWidth, cv.clientHeight] : null,
    dpr: window.devicePixelRatio || 1,
    errors: null
  };
  let edge = null;
  if (cv && window.__globe && window.__camera) {
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
      const sx = cv.width / innerWidth, sy = cv.height / innerHeight;
      const gx = Math.round(cx * sx), gy = Math.round(cy * sy), gr = Math.round(r * sx);
      const x0 = Math.max(0, gx - gr), y0 = Math.max(0, gy - gr);
      const w = Math.min(cv.width - x0, gr * 2), h = Math.min(cv.height - y0, gr * 2);
      const tmp = document.createElement('canvas');
      tmp.width = 512; tmp.height = 256;
      const tctx = tmp.getContext('2d');
      tctx.drawImage(cv, x0, y0, w, h, 0, 0, 512, 256);
      const img = tctx.getImageData(0, 0, 512, 256).data;
      let sum = 0, n = 0;
      for (let y = 1; y < 255; y += 2) {
        for (let x = 1; x < 511; x += 2) {
          const i = (y * 512 + x) * 4;
          const g0 = 0.299 * img[i] + 0.587 * img[i + 1] + 0.114 * img[i + 2];
          const gx2 = 0.299 * img[i + 4] + 0.587 * img[i + 5] + 0.114 * img[i + 6];
          const gy2 = 0.299 * img[i + 2048] + 0.587 * img[i + 2049] + 0.114 * img[i + 2050];
          sum += Math.abs(g0 - gx2) + Math.abs(g0 - gy2);
          n += 2;
        }
      }
      edge = Math.round(sum / n * 100) / 100;
      info.globeRegion = [x0, y0, w, h, gx, gy, gr];
    } catch (err) {
      info.edgeError = String(err);
    }
  }
  info.edge = edge;
  return info;
})()`;

const out = {};

// 1920×1080：先采 2048 阶段，再等 5400 终态
await send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: 'http://127.0.0.1:8765/index.html?v=' + Date.now() });
await wait(4000);
const early = await evalJs(metricJs);
early.errors = [...errors];
out['1920-early'] = early;
await capture('./v49_4_screenshots/index-1920x1080-early.png');
await wait(9000);
const final1920 = await evalJs(metricJs);
final1920.errors = [...errors];
out['1920-final'] = final1920;
await capture('./v49_4_screenshots/index-1920x1080-final.png');

// 其他尺寸（等待高清终态）
for (const [w, h, dsf, waitMs, name] of [[2560, 1440, 1, 9000, '2560x1440'], [1366, 768, 1, 9000, '1366x768'], [390, 844, 1, 6000, '390x844'], [1920, 1080, 2, 9000, '1920x1080-dpr2']]) {
  errors.length = 0;
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: dsf, mobile: w < 600 });
  await send('Page.navigate', { url: 'http://127.0.0.1:8765/index.html?v=' + Date.now() });
  await wait(waitMs);
  const m = await evalJs(metricJs);
  m.errors = [...errors];
  out[name] = m;
  await capture('./v49_4_screenshots/index-' + name + '.png');
}

writeFileSync(new URL('./v494_check.json', import.meta.url), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
ws.close();
