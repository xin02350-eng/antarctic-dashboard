const pages = ['hardware.html', 'hardware-a02.html', 'hardware-a03.html'];
const list = await fetch('http://127.0.0.1:9222/json/list').then(r => r.json());
const page = list.find(t => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { const q = pending.get(m.id); pending.delete(m.id); m.error ? q.rej(new Error(JSON.stringify(m.error))) : q.res(m.result); } };
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async ex => { const r = await send('Runtime.evaluate', { expression: ex, returnByValue: true, awaitPromise: true }); return r.result ? r.result.value : null; };
await send('Runtime.enable');
await send('Page.enable');
async function audit(p, w, h) {
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 2, mobile: true });
  await send('Page.navigate', { url: 'http://127.0.0.1:8765/' + p + '?v=' + Date.now() });
  for (let k = 0; k < 25; k++) { await new Promise(r => setTimeout(r, 300)); const cur = await ev(`location.pathname + '|' + document.readyState`); if (cur && cur.startsWith('/' + p) && cur.endsWith('complete')) break; }
  await new Promise(r => setTimeout(r, 1200));
  await ev(`if (window.anxApplyLang) window.anxApplyLang('zh'); true`);
  await new Promise(r => setTimeout(r, 400));
  const info = await ev(`(() => ({ sh: document.documentElement.scrollHeight, ch: document.documentElement.clientHeight, sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }))()`);
  console.log(p + '@' + w + 'x' + h + ' ' + JSON.stringify(info));
}
for (const [w, h] of [[844, 390], [740, 360], [640, 360]]) for (const p of pages) { await audit(p, w, h); }
ws.close();
