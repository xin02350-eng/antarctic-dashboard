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
await send('Page.navigate', { url: 'http://127.0.0.1:8765/hardware.html?v=' + Date.now() });
for (let k = 0; k < 25; k++) { await new Promise(r => setTimeout(r, 300)); const cur = await ev(`location.pathname + '|' + document.readyState`); if (cur && cur.startsWith('/hardware.html') && cur.endsWith('complete')) break; }
await new Promise(r => setTimeout(r, 600));
await ev(`if (window.anxApplyLang) window.anxApplyLang('zh'); true`);
await new Promise(r => setTimeout(r, 400));
const info = await ev(`(() => {
  const g = sel => { const el = document.querySelector(sel); if (!el) return null; const b = el.getBoundingClientRect(); const s = getComputedStyle(el); return { top: Math.round(b.top), h: Math.round(b.height), bottom: Math.round(b.bottom), minH: s.minHeight, display: s.display, overflow: s.overflow }; };
  const deep = [];
  document.querySelectorAll('body *').forEach(el => {
    const s = getComputedStyle(el); if (s.display === 'none' || s.visibility === 'hidden') return;
    const b = el.getBoundingClientRect();
    if (b.bottom > 391 && b.width > 8 && b.height > 8) {
      let p = el.parentElement, clipped = false;
      while (p) { const st = getComputedStyle(p); if (st.overflowY === 'hidden' || st.overflowY === 'auto' || st.overflowY === 'scroll') { clipped = true; break; } p = p.parentElement; }
      if (!clipped) deep.push(String(el.className).slice(0, 30) + ' B' + Math.round(b.bottom) + ' T' + Math.round(b.top));
    }
  });
  return { body: g('body'), app: g('.app'), sidebar: g('.sidebar'), main: g('main'), header: g('.mission-header'), docSingle: g('.doc-single'), stage: g('.doc-stage'), photo: g('.doc-photo'), side: g('.doc-side'), deep: deep.slice(0, 10), sh: document.documentElement.scrollHeight };
})()`);
console.log(JSON.stringify(info, null, 1));
ws.close();
