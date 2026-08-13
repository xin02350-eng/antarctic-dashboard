import { writeFileSync } from 'node:fs';

const list = await fetch('http://127.0.0.1:9222/json/list').then(r => r.json());
const page = list.find(t => t.type === 'page');
if (!page) throw new Error('page target not found');

const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
let collectedErrors = [];

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
    collectedErrors.push((msg.params.exceptionDetails.exception && msg.params.exceptionDetails.exception.description || msg.params.exceptionDetails.text || '').split('\n')[0]);
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

const check = `(() => {
  const rect = sel => { const el = document.querySelector(sel); if (!el) return null; const r = el.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom), Math.round(r.width), Math.round(r.height)]; };
  const brandH1 = document.querySelector('.brand h1');
  const bh = brandH1 ? { scrollW: brandH1.scrollWidth, clientW: brandH1.clientWidth, rect: rect('.brand'), txt: brandH1.textContent.replace(/\\s+/g, ' ').trim() } : null;
  const lsw = document.querySelector('.lang-switch');
  const lr = lsw ? lsw.getBoundingClientRect() : null;
  return {
    url: location.pathname.split('/').pop(),
    lang: document.documentElement.getAttribute('lang'),
    title: document.title,
    brand: bh,
    header: rect('.mission-header') || rect('.top') || rect('header'),
    langRect: lr ? [Math.round(lr.left), Math.round(lr.top), Math.round(lr.right), Math.round(lr.bottom)] : null,
    scroll: [document.documentElement.scrollWidth, document.documentElement.scrollHeight, document.documentElement.clientWidth, document.documentElement.clientHeight],
    bodyText: document.body.innerText.slice(0, 400)
  };
})()`;

const pages = ['index.html', 'network.html', 'location.html', 'dashboard.html', 'dashboard-a02.html', 'dashboard-a03.html',
  'sensors.html', 'telemetry.html', 'hardware.html', 'analysis.html',
  'location-a02.html', 'location-a03.html', 'sensors-a02.html', 'sensors-a03.html',
  'telemetry-a02.html', 'telemetry-a03.html', 'hardware-a02.html', 'hardware-a03.html',
  'analysis-a02.html', 'analysis-a03.html', 'a02.html'];
const out = {};

for (const [w, h] of [[1920, 1080], [1366, 768], [768, 1024]]) {
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
  for (const lang of ['en', 'zh']) {
    for (const p of pages) {
      collectedErrors.length = 0;
      await send('Page.navigate', { url: 'http://127.0.0.1:8765/' + p + '?v=' + Date.now() });
      await wait(p === 'index.html' ? 3000 : 2200);
      await evalJs(`window.anxApplyLang && window.anxApplyLang(${JSON.stringify(lang)})`);
      await wait(300);
      const m = await evalJs(check);
      m.errors = [...new Set(collectedErrors)];
      out[p + '@' + w + lang] = m;
    }
  }
}

writeFileSync(new URL('./v491_check.json', import.meta.url), JSON.stringify(out, null, 2));
console.log('done', Object.keys(out).length);
ws.close();
