const list = await fetch('http://127.0.0.1:9222/json/list').then(r => r.json());
const target = list.find(t => t.type === 'page');
const ws = new WebSocket(target.webSocketDebuggerUrl);
let id = 0; const pending = new Map();
const errors = [];
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { const q = pending.get(m.id); pending.delete(m.id); m.error ? q.rej(new Error(JSON.stringify(m.error))) : q.res(m.result); } if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails?.text || '?'); };
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async ex => { const r = await send('Runtime.evaluate', { expression: ex, returnByValue: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails)); return r.result ? r.result.value : null; };
await send('Runtime.enable');

const countData = () => ev(`performance.getEntriesByType('resource').filter(e => e.name.indexOf('data.json') >= 0).length`);

async function waitPage(page, waitMs) {
  await send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `http://127.0.0.1:8765/${page}?v=` + Date.now() });
  await new Promise(r => setTimeout(r, waitMs));
  await ev(`if (window.anxApplyLang) window.anxApplyLang('zh'); true`);
  await new Promise(r => setTimeout(r, 500));
}

// network: own 30s interval
await waitPage('network.html', 6000);
const n1 = await countData();
await new Promise(r => setTimeout(r, 32000));
const n2 = await countData();
console.log('network data fetches', n1, '->', n2);

// sensors: main.js 30s interval
await waitPage('sensors.html', 6000);
const s1 = await countData();
await new Promise(r => setTimeout(r, 32000));
const s2 = await countData();
console.log('sensors data fetches', s1, '->', s2);

// telemetry: manual anx:data re-render
await waitPage('telemetry.html', 6000);
const rowsBefore = await ev(`document.querySelectorAll('#telemetryData tbody tr').length`);
await ev(`window.dispatchEvent(new CustomEvent('anx:data')); true`);
await new Promise(r => setTimeout(r, 800));
const rowsAfter = await ev(`document.querySelectorAll('#telemetryData tbody tr').length`);
console.log('telemetry rows', rowsBefore, '->', rowsAfter);

// analysis: manual anx:data re-render
await waitPage('analysis.html', 6000);
await ev(`window.dispatchEvent(new CustomEvent('anx:data')); true`);
await new Promise(r => setTimeout(r, 800));
const hasP = await ev(`/大气压强|PRESSURE/.test(document.body.innerText)`);
console.log('analysis hasPressure after event', hasP);

console.log('JS_ERRORS', JSON.stringify(errors));
ws.close();
