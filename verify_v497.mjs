import { writeFileSync, mkdirSync } from 'node:fs';

mkdirSync(new URL('./v49_7_screenshots/', import.meta.url), { recursive: true });

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

const fpsProbe = `(async () => {
  const samples = [];
  let last = performance.now();
  await new Promise(resolve => {
    function step(t) {
      samples.push(t - last);
      last = t;
      if (samples.length < 120) requestAnimationFrame(step);
      else resolve();
    }
    requestAnimationFrame(step);
  });
  samples.shift();
  const sorted = [...samples].sort((a, b) => a - b);
  const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
  return {
    avgMs: Math.round(avg * 10) / 10,
    p95Ms: Math.round(sorted[Math.floor(samples.length * 0.95)] * 10) / 10,
    fps: Math.round(1000 / avg),
    rotY: window.__globe ? window.__globe.rotation.y : null,
    ready: !!window.__globeReady,
    land: window.__earthLand || 0,
    ice: !!window.__earthIce,
    texW: window.__earthTexW || 0,
    heap: (performance.memory && performance.memory.usedJSHeapSize) ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null
  };
})()`;

const out = {};

// Part A: 多尺寸 FPS + 截图
for (const [w, h, name] of [[1920, 1080, '1920x1080'], [2560, 1440, '2560x1440'], [1366, 768, '1366x768']]) {
  errors.length = 0;
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: 'http://127.0.0.1:8765/index.html?v=' + Date.now() });
  await wait(12000);
  const m = await evalJs(fpsProbe);
  m.errors = [...errors];
  out[name] = m;
  await capture('./v49_7_screenshots/index-' + name + '.png');
}

// Part B: 1920×1080 60 秒稳定性（含语言切换与 resize）
await send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: 'http://127.0.0.1:8765/index.html?v=' + Date.now() });
await wait(8000);
const stability = [];
for (let step = 0; step < 6; step++) {
  if (step === 3) {
    await evalJs(`window.anxApplyLang && window.anxApplyLang('en')`);
    await wait(1500);
  }
  if (step === 4) {
    await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
    await wait(1500);
    await send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
    await wait(1500);
  }
  errors.length = 0;
  const m = await evalJs(fpsProbe);
  m.errors = [...errors];
  stability.push({ at: step * 10, ...m });
  if (step < 5) await wait(10000 - 2000);
}
out.stability60 = stability;

writeFileSync(new URL('./v497_check.json', import.meta.url), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
ws.close();
