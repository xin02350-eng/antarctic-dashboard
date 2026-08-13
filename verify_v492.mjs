import { writeFileSync, mkdirSync } from 'node:fs';

mkdirSync(new URL('./v49_2_screenshots/', import.meta.url), { recursive: true });

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

const check = `(() => {
  const rect = sel => { const el = document.querySelector(sel); if (!el) return null; const r = el.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom), Math.round(r.width), Math.round(r.height)]; };
  const hero = rect('.hero');
  const btn = rect('.btn');
  const h1 = rect('.hero h1');
  const kicker = rect('.kicker');
  const globe = window.__globe && window.__camera ? (() => {
    try {
      const g = window.__globe, cam = window.__camera;
      g.updateMatrixWorld();
      const c = g.position.clone().project(cam);
      const rw = 100 * g.scale.x;
      const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0).normalize();
      const e = g.position.clone().add(right.multiplyScalar(rw)).project(cam);
      const cx = (c.x * 0.5 + 0.5) * innerWidth;
      const cy = (-c.y * 0.5 + 0.5) * innerHeight;
      return { cx: Math.round(cx), cy: Math.round(cy), r: Math.round(Math.abs(e.x - c.x) * innerWidth / 2) };
    } catch (err) { return null; }
  })() : null;
  let overlap = null;
  if (globe && hero) {
    const dx = Math.max(hero[0] - globe.cx, 0, globe.cx - hero[2]);
    const dy = Math.max(hero[1] - globe.cy, 0, globe.cy - hero[3]);
    overlap = Math.sqrt(dx * dx + dy * dy) < globe.r;
  }
  return {
    lang: document.documentElement.getAttribute('lang'),
    title: document.title,
    subExists: !!document.querySelector('.hero .sub'),
    kicker, h1, btn, hero,
    gapTitleBtn: h1 && btn ? btn[1] - h1[3] : null,
    globe, overlap,
    scroll: [document.documentElement.scrollWidth, document.documentElement.scrollHeight, document.documentElement.clientWidth, document.documentElement.clientHeight],
    text: document.body.innerText.slice(0, 500),
    globeReady: !!window.__globeReady
  };
})()`;

const out = {};
const sizes = [[1920, 1080], [1366, 768], [768, 1024], [390, 844]];
for (const [w, h] of sizes) {
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 600 });
  for (const lang of ['zh', 'en']) {
    errors.length = 0;
    await send('Page.navigate', { url: 'http://127.0.0.1:8765/index.html?v=' + Date.now() });
    await wait(3200);
    await evalJs(`window.anxApplyLang && window.anxApplyLang(${JSON.stringify(lang)})`);
    await wait(500);
    const m = await evalJs(check);
    m.errors = [...errors];
    out[w + 'x' + h + lang] = m;
    await capture('./v49_2_screenshots/index-' + w + 'x' + h + '-' + lang + '.png');
  }
}

writeFileSync(new URL('./v492_check.json', import.meta.url), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
ws.close();
