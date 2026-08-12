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

const checkJs = `(() => {
  const btns = [...document.querySelectorAll('.lang-switch button')];
  const visible = btns.filter(b => b.getBoundingClientRect().width > 0);
  return {
    url: location.pathname.split('/').pop(),
    title: document.title,
    h1: document.querySelector('.brand h1') ? document.querySelector('.brand h1').textContent.replace(/\\s+/g, ' ').trim() : null,
    buttons: btns.length,
    visibleButtons: visible.length,
    active: btns.filter(b => b.classList.contains('active')).map(b => b.getAttribute('data-lang')),
    globeReady: !!window.__globeReady,
    fallbackVisible: (() => { const f = document.querySelector('.globe-fallback'); return f ? getComputedStyle(f).display !== 'none' : null; })(),
    attributionHidden: (() => { const a = document.querySelector('.leaflet-control-attribution'); return a ? getComputedStyle(a).display === 'none' : null; })(),
    hasFallbackFn: typeof window.__libFallback === 'function'
  };
})()`;

const modulePages = ['location-a02.html','location-a03.html','sensors-a02.html','sensors-a03.html','telemetry-a02.html','telemetry-a03.html','hardware-a02.html','hardware-a03.html','analysis-a02.html','analysis-a03.html'];
const brandPages = ['sensors.html','telemetry.html','hardware.html','analysis.html'];
const dashPages = ['dashboard.html','dashboard-a02.html','dashboard-a03.html'];
const out = {};

await send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });

for (const p of [...modulePages, ...brandPages, ...dashPages, 'index.html']) {
  errors.length = 0;
  await send('Page.navigate', { url: 'http://127.0.0.1:8765/' + p + '?v=' + Date.now() });
  await wait(p === 'index.html' ? 3200 : 2200);
  await evalJs(`window.anxApplyLang && window.anxApplyLang('zh')`);
  await wait(400);
  const zh = await evalJs(checkJs);
  // 点击 EN 按钮（真实点击事件），验证按钮可交互
  if (modulePages.includes(p)) {
    await evalJs(`(() => { const b = document.querySelector('.lang-switch button[data-lang="en"]'); if (b) b.click(); })()`);
    await wait(300);
    const en = await evalJs(`({ lang: document.documentElement.getAttribute('lang'), title: document.title, active: [...document.querySelectorAll('.lang-switch button.active')].map(x => x.getAttribute('data-lang')), visibleButtons: [...document.querySelectorAll('.lang-switch button')].filter(b => b.getBoundingClientRect().width > 0).length })`);
    out[p] = { zh, en, errors: [...errors] };
  } else {
    out[p] = { zh, errors: [...errors] };
  }
}

writeFileSync(new URL('./v48_fix_check.json', import.meta.url), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
ws.close();
