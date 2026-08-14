import { writeFileSync, mkdirSync } from 'node:fs';
mkdirSync(new URL('./v49_19_screenshots/', import.meta.url), { recursive: true });

const list = await fetch('http://127.0.0.1:9222/json/list').then(r => r.json());
const page = list.find(t => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const pending = new Map(); let errors = [];
function send(method, params = {}) { return new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); }); }
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); }
  else if (m.method === 'Runtime.exceptionThrown') { errors.push((m.params.exceptionDetails.exception && m.params.exceptionDetails.exception.description || m.params.exceptionDetails.text || '').split('\n')[0]); }
  else if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') { errors.push('LOG: ' + m.params.entry.text.slice(0, 180)); }
};
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
await send('Runtime.enable'); await send('Log.enable'); await send('Network.setCacheDisabled', { cacheDisabled: true });
const ev = async e => (await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true })).result.value;
const wait = ms => new Promise(r => setTimeout(r, ms));

const run = async (lang, tag) => {
  errors.length = 0;
  await send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: 'http://127.0.0.1:8765/sensors.html?v=' + Date.now() });
  await wait(7000);
  await ev('window.anxApplyLang && window.anxApplyLang(' + JSON.stringify(lang) + '); true');
  await wait(300);
  const m = await ev(`(() => {
    const el = document.getElementById('windNoData');
    let windPoints = null;
    try { if (typeof charts !== 'undefined' && charts.chartWind) windPoints = charts.chartWind.data.datasets[0].data.length; } catch (e) {}
    return {
      dataLen: (typeof DATA !== 'undefined' && DATA) ? DATA.length : null,
      windNoDataText: el ? el.textContent.trim() : null,
      windNoDataDisplay: el ? getComputedStyle(el).display : null,
      windNoDataInlineDisplay: el ? el.style.display : null,
      windPoints,
      lang: window.anxCurrentLang
    };
  })()`);
  m.errors = [...errors];
  const shot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  writeFileSync(new URL('./v49_19_screenshots/sensors-' + tag + '.png', import.meta.url), Buffer.from(shot.data, 'base64'));
  return m;
};

const out = {
  zh: await run('zh', 'zh'),
  en: await run('en', 'en')
};
writeFileSync(new URL('./v4919_check.json', import.meta.url), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
ws.close();
