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
await new Promise(r => setTimeout(r, 1000));
await ev(`if (window.anxApplyLang) window.anxApplyLang('zh'); true`);
await new Promise(r => setTimeout(r, 400));
const info = await ev(`(() => {
  const btn = document.getElementById('exploreBtn');
  const txt = [...document.querySelectorAll('.btn-txt')].find(x => getComputedStyle(x).display !== 'none');
  const before = getComputedStyle(btn, '::before');
  const br = btn.getBoundingClientRect(), tr = txt.getBoundingClientRect();
  const cs = getComputedStyle(btn);
  const arrow = btn.querySelector('.explore-arrow');
  const ar = arrow.getBoundingClientRect();
  return {
    btn: { t: Math.round(br.top), b: Math.round(br.bottom), l: Math.round(br.left), r: Math.round(br.right), h: Math.round(br.height) },
    text: { t: Math.round(tr.top), b: Math.round(tr.bottom), l: Math.round(tr.left), r: Math.round(tr.right) },
    beforeInset: before.inset, beforePad: before.padding,
    btnComputed: { height: cs.height, minHeight: cs.minHeight, lineHeight: cs.lineHeight, display: cs.display, padding: cs.padding },
    arrow: { t: Math.round(ar.top), b: Math.round(ar.bottom), h: Math.round(ar.height) },
    gapTop: Math.round(tr.top - br.top), gapBottom: Math.round(br.bottom - tr.bottom),
    gapLeft: Math.round(tr.left - br.left), gapRight: Math.round(br.right - tr.right)
  };
})()`);
console.log(JSON.stringify(info, null, 1));
ws.close();
