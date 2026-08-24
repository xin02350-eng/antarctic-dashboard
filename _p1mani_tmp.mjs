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
await send('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 2, mobile: true });
await send('Page.navigate', { url: 'http://127.0.0.1:8765/index.html?v=' + Date.now() });
for (let k = 0; k < 20; k++) { await new Promise(r => setTimeout(r, 300)); const cur = await ev(`location.pathname + '|' + document.readyState`); if (cur && cur.startsWith('/index.html') && cur.endsWith('complete')) break; }
await new Promise(r => setTimeout(r, 1500));
await ev(`if (window.anxApplyLang) window.anxApplyLang('zh'); true`);
await new Promise(r => setTimeout(r, 400));
const info = await ev(`(() => {
  const m = document.querySelector('.manifesto');
  const s = getComputedStyle(m);
  const r = m.getBoundingClientRect();
  const loaded = document.body.classList.contains('loaded');
  return {
    loaded, text: m.textContent.trim().slice(0, 40),
    display: s.display, visibility: s.visibility, opacity: s.opacity,
    pos: s.position, left: s.left, bottom: s.bottom,
    rect: { t: Math.round(r.top), b: Math.round(r.bottom), l: Math.round(r.left), r: Math.round(r.right), h: Math.round(r.height) },
    ch: document.documentElement.clientHeight
  };
})()`);
console.log(JSON.stringify(info, null, 1));
ws.close();
