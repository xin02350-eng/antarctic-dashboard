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

const out = {};

// 1) 导航往返：首页 → Network → Location → Dashboard → A02，再返回
await send('Emulation.setDeviceMetricsOverride', { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
const route = ['index.html', 'network.html', 'location.html', 'dashboard.html', 'dashboard-a02.html'];
const navLog = [];
for (const p of route) {
  errors.length = 0;
  await send('Page.navigate', { url: 'http://127.0.0.1:8765/' + p + '?v=' + Date.now() });
  await wait(p === 'index.html' ? 3000 : 2000);
  navLog.push({ to: p, url: await evalJs('location.pathname.split("/").pop()'), errors: [...errors] });
}
for (let i = 0; i < 4; i++) {
  errors.length = 0;
  await evalJs('history.back()');
  await wait(1800);
  navLog.push({ back: i + 1, url: await evalJs('location.pathname.split("/").pop()'), errors: [...errors] });
}
for (let i = 0; i < 4; i++) {
  errors.length = 0;
  await evalJs('history.forward()');
  await wait(1800);
  navLog.push({ forward: i + 1, url: await evalJs('location.pathname.split("/").pop()'), errors: [...errors] });
}
out.navigation = navLog;

// 2) 可聚焦性：所有按钮/链接应可聚焦且可点
await send('Page.navigate', { url: 'http://127.0.0.1:8765/network.html?v=' + Date.now() });
await wait(2200);
out.focus = await evalJs(`(() => {
  const els = [...document.querySelectorAll('a, button')];
  const bad = els.filter(el => {
    const cs = getComputedStyle(el);
    return cs.pointerEvents === 'none' || el.tabIndex < 0 || el.getAttribute('disabled') !== null;
  });
  return { total: els.length, bad: bad.length, badSamples: bad.slice(0, 8).map(el => el.className || el.tagName) };
})()`);

// 3) 首页帧率采样（约 2 秒）与动画循环数量
await send('Page.navigate', { url: 'http://127.0.0.1:8765/index.html?v=' + Date.now() });
await wait(3000);
out.indexPerf = await evalJs(`(async () => {
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
  const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
  const p95 = [...samples].sort((a, b) => a - b)[Math.floor(samples.length * 0.95)];
  return {
    globeReady: !!window.__globeReady,
    canvasCount: document.querySelectorAll('canvas').length,
    avgFrameMs: Math.round(avg * 10) / 10,
    p95FrameMs: Math.round(p95 * 10) / 10,
    fps: Math.round(1000 / avg)
  };
})()`);

// 4) 传感器页图表状态
await send('Page.navigate', { url: 'http://127.0.0.1:8765/sensors.html?v=' + Date.now() });
await wait(2500);
out.sensors = await evalJs(`(() => ({
  chartGlobal: typeof window.Chart === 'function',
  canvases: document.querySelectorAll('canvas').length,
  hasChartCanvases: document.querySelectorAll('canvas').length > 0
}))()`);

// 5) 刷新后语言状态保持
await send('Page.navigate', { url: 'http://127.0.0.1:8765/dashboard.html?v=' + Date.now() });
await wait(2200);
await evalJs(`window.anxApplyLang && window.anxApplyLang('zh')`);
await wait(300);
await send('Page.reload', { ignoreCache: true });
await wait(2500);
out.refresh = await evalJs(`({ lang: document.documentElement.getAttribute('lang'), title: document.title, mode: document.querySelector('#modeDisplay') ? document.querySelector('#modeDisplay').textContent.trim() : null })`);

writeFileSync(new URL('./v48_final_check.json', import.meta.url), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
ws.close();
