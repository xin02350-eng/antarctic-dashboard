import { writeFileSync } from 'node:fs';

const list = await fetch('http://127.0.0.1:9222/json/list').then(r => r.json());
const page = list.find(t => t.type === 'page');
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
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) {
    const p = pending.get(m.id); pending.delete(m.id);
    m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result);
  } else if (m.method === 'Runtime.exceptionThrown') {
    errors.push((m.params.exceptionDetails.exception && m.params.exceptionDetails.exception.description || m.params.exceptionDetails.text || '').split('\n')[0]);
  } else if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') {
    errors.push('LOG: ' + m.params.entry.text.slice(0, 200));
  }
};
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
await send('Runtime.enable');
await send('Log.enable');
await send('Network.setCacheDisabled', { cacheDisabled: true });
const ev = async e => (await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true })).result.value;
const wait = ms => new Promise(r => setTimeout(r, ms));

const out = {};

// Telemetry: check table headers/units and first row values for l + wind
errors.length = 0;
await send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: 'http://127.0.0.1:8765/telemetry.html?v=' + Date.now() });
await wait(7000);
out.telemetry = await ev(`(() => {
  const th = Array.from(document.querySelectorAll('.tel-table thead th')).map(e => e.textContent.trim());
  const tr = document.querySelector('.tel-table tbody tr');
  const cells = tr ? Array.from(tr.querySelectorAll('td')).map(e => e.textContent.trim()) : [];
  return { headers: th, firstRow: cells, lang: window.anxCurrentLang, dataLen: (typeof DATA !== 'undefined' && DATA) ? DATA.length : null, errors: null };
})()`);
out.telemetry.errors = [...errors];

// Dashboard: confirm solar card reads from l (latest record l=1)
errors.length = 0;
await send('Page.navigate', { url: 'http://127.0.0.1:8765/dashboard.html?v=' + Date.now() });
await wait(5000);
out.dashboard = await ev(`(() => ({
  solar: (document.getElementById('solar') || {}).textContent,
  voltage: (document.getElementById('voltage') || {}).textContent,
  temperature: (document.getElementById('temperature') || document.getElementById('insideTemp') || {}).textContent,
  humidity: (document.getElementById('humidity') || {}).textContent,
  dataLen: (typeof DATA !== 'undefined' && DATA) ? DATA.length : null
}))()`);
out.dashboard.errors = [...errors];

// Hardware: confirm hardwareSolar reads from l
errors.length = 0;
await send('Page.navigate', { url: 'http://127.0.0.1:8765/hardware.html?v=' + Date.now() });
await wait(5000);
out.hardware = await ev(`(() => ({
  hardwareSolar: (document.getElementById('hardwareSolar') || {}).textContent,
  hardwareVoltage: (document.getElementById('hardwareVoltage') || {}).textContent,
  dataLen: (typeof DATA !== 'undefined' && DATA) ? DATA.length : null
}))()`);
out.hardware.errors = [...errors];

writeFileSync(new URL('./v4918_check.json', import.meta.url), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
ws.close();
