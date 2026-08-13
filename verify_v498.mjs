import { writeFileSync, mkdirSync } from 'node:fs';

mkdirSync(new URL('./v49_8_screenshots/', import.meta.url), { recursive: true });

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
    errors.push('LOG: ' + msg.params.entry.text.slice(0, 200));
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
  writeFileSync(new URL(file, import.meta.url), Buffer.from(res.data, 'base64'));
}

const probe = `(() => {
  const g = window.__globe, cam = window.__camera;
  cam.updateMatrixWorld(true);
  cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
  g.updateMatrixWorld();
  const dir = cam.position.clone().sub(new THREE.Vector3().setFromMatrixPosition(g.matrixWorld));
  const inv = new THREE.Matrix4().makeRotationY(-g.rotation.y);
  const local = dir.clone().applyMatrix4(inv);
  let faceLng = Math.atan2(local.z, local.x) * 180 / Math.PI - 90;
  if (faceLng < -180) faceLng += 360;
  if (faceLng > 180) faceLng -= 360;
  function proj(lat, lng) {
    const phi = (90 - lat) * Math.PI / 180;
    const theta = (90 - lng) * Math.PI / 180;
    const v = new THREE.Vector3(100 * Math.sin(phi) * Math.cos(theta), 100 * Math.cos(phi), 100 * Math.sin(phi) * Math.sin(theta));
    const p = v.clone().applyMatrix4(g.matrixWorld).project(cam);
    return [Math.round((p.x * 0.5 + 0.5) * innerWidth), Math.round((-p.y * 0.5 + 0.5) * innerHeight), +p.z.toFixed(2)];
  }
  const c = g.position.clone().project(cam);
  const edge = new THREE.Vector3(100, 0, 0).applyMatrix4(g.matrixWorld).project(cam);
  return {
    ready: !!window.__globeReady,
    faceLng: Math.round(faceLng),
    rotationY: +g.rotation.y.toFixed(3),
    center: [Math.round((c.x * 0.5 + 0.5) * innerWidth), Math.round((-c.y * 0.5 + 0.5) * innerHeight)],
    radiusPx: Math.round(Math.abs(edge.x - c.x) * innerWidth / 2),
    nj: proj(31.9, 118.8),
    ne: proj(45.75, 126.65),
    an: proj(-82, 70),
    scroll: [document.documentElement.scrollWidth, document.documentElement.clientWidth],
    errors: null
  };
})()`;

const out = {};
for (const [w, h, name] of [[1920, 1080, '1920x1080'], [1366, 768, '1366x768'], [2560, 1440, '2560x1440']]) {
  errors.length = 0;
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: 'http://127.0.0.1:8765/index.html?v=' + Date.now() });
  await wait(10000);
  const m = await evalJs(probe);
  m.errors = [...errors];
  out[name] = m;
  await capture('./v49_8_screenshots/index-' + name + '.png');
}

writeFileSync(new URL('./v498_check.json', import.meta.url), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
ws.close();
