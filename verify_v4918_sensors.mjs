import { writeFileSync, mkdirSync } from 'node:fs';
mkdirSync(new URL('./v49_18_screenshots/', import.meta.url), { recursive: true });

const list = await fetch('http://127.0.0.1:9222/json/list').then(r => r.json());
const page = list.find(t => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const pending = new Map(); let errors = [];
function send(method, params = {}) { return new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); }); }
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); }
  else if (m.method === 'Runtime.exceptionThrown') { errors.push((m.params.exceptionDetails.exception && m.params.exceptionDetails.exception.description || m.params.exceptionDetails.text || '').split('\n')[0]); }
  else if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') { errors.push('LOG: ' + m.params.entry.text.slice(0, 200)); }
};
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
await send('Runtime.enable'); await send('Log.enable'); await send('Network.setCacheDisabled', { cacheDisabled: true });
const ev = async e => (await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true })).result.value;

await send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: 'http://127.0.0.1:8765/sensors.html?v=' + Date.now() });
await new Promise(r => setTimeout(r, 8000));

const probe = await ev(`(() => {
  const ids = ['chartInTemp','chartInHum','chartOutTemp','chartOutHum','chartSolar','chartCurrent','chartVoltage','chartWind'];
  const st = {};
  ids.forEach(cid => {
    let inst = null;
    try { if (typeof charts !== 'undefined') inst = charts[cid] || null; } catch (e) {}
    let first = null, last = null;
    if (inst && inst.data && inst.data.datasets && inst.data.datasets[0]) {
      const d = inst.data.datasets[0].data;
      first = d[0]; last = d[d.length - 1];
    }
    st[cid] = inst ? { points: inst.data.datasets[0].data.length, first, last } : { points: null };
  });
  return { dataLen: (typeof DATA !== 'undefined' && DATA) ? DATA.length : null, chartJs: typeof Chart === 'function', st };
})()`);
probe.errors = [...errors];

const shot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
writeFileSync(new URL('./v49_18_screenshots/sensors-1920x1080-zh.png', import.meta.url), Buffer.from(shot.data, 'base64'));

writeFileSync(new URL('./v4918_sensors_result.json', import.meta.url), JSON.stringify(probe, null, 2));
console.log(JSON.stringify(probe, null, 2));
ws.close();
