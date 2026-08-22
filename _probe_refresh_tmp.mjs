const list = await fetch('http://127.0.0.1:9222/json/list').then(r => r.json());
const target = list.find(t => t.type === 'page');
const ws = new WebSocket(target.webSocketDebuggerUrl);
let id = 0; const pending = new Map();
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { const q = pending.get(m.id); pending.delete(m.id); m.error ? q.rej(new Error(JSON.stringify(m.error))) : q.res(m.result); } };
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async ex => { const r = await send('Runtime.evaluate', { expression: ex, returnByValue: true }); return r.result ? r.result.value : null; };
await send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: 'http://127.0.0.1:8765/telemetry.html?v=' + Date.now() });
await new Promise(r => setTimeout(r, 7000));
const t = await ev(`(() => { const b = document.getElementById('telemetryData'); return { html: b ? b.innerHTML.slice(0, 300) : 'NOBOX', tables: document.querySelectorAll('table').length, trs: document.querySelectorAll('tbody tr').length }; })()`);
console.log('TELEMETRY', JSON.stringify(t));
await send('Page.navigate', { url: 'http://127.0.0.1:8765/analysis.html?v=' + Date.now() });
await new Promise(r => setTimeout(r, 7000));
const a = await ev(`(() => { const body = document.body.innerText || ''; return { len: body.length, hasP: /大气压强|PRESSURE/.test(body), hasW: /风向|WIND DIRECTION/.test(body), dataReady: typeof DATA !== 'undefined' ? DATA.length : -1 }; })()`);
console.log('ANALYSIS', JSON.stringify(a));
await send('Page.navigate', { url: 'http://127.0.0.1:8765/sensors.html?v=' + Date.now() });
await new Promise(r => setTimeout(r, 7000));
const s = await ev(`(() => {
  let callResult = 'n/a';
  try { loadData(); callResult = 'called'; } catch (e) { callResult = 'THROW ' + String(e); }
  return { dataLen: typeof DATA !== 'undefined' ? DATA.length : -1, lastKey: typeof lastDataKey !== 'undefined' ? lastDataKey : 'undef', busy: typeof dataBusy !== 'undefined' ? dataBusy : 'undef', panels: document.querySelectorAll('.panel').length, callResult };
})()`);
await new Promise(r => setTimeout(r, 6000));
const s2 = await ev(`({ dataLen: typeof DATA !== 'undefined' ? DATA.length : -1, lastKey: typeof lastDataKey !== 'undefined' ? lastDataKey : 'undef', busy: typeof dataBusy !== 'undefined' ? dataBusy : 'undef', panels: document.querySelectorAll('.panel').length })`);
console.log('SENSORS', JSON.stringify(s));
console.log('SENSORS2', JSON.stringify(s2));
ws.close();
