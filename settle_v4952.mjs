const list = await fetch('http://127.0.0.1:9222/json/list').then(r => r.json());
const page = list.find(t => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const pending = new Map();
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { const q = pending.get(m.id); pending.delete(m.id); m.error ? q.rej(new Error(JSON.stringify(m.error))) : q.res(m.result); } };
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
await send('Runtime.enable');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: 'http://127.0.0.1:8765/index.html?v=' + Date.now() });
await new Promise(r => setTimeout(r, 1500));

const ev = async e => { const rr = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); return rr.result ? rr.result.value : null; };

for (const lang of ['zh', 'en']) {
  await ev(`window.anxApplyLang && window.anxApplyLang(${JSON.stringify(lang)}); true`);
  const out = [];
  for (let i = 0; i < 20; i++) {
    const s = await ev(`(() => {
      const btn = document.getElementById('exploreBtn');
      const cs = getComputedStyle(btn);
      const r = btn.getBoundingClientRect();
      const t = document.querySelector('.hero h1').getBoundingClientRect();
      const m = document.querySelector('.manifesto').getBoundingClientRect();
      return {
        y: Math.round(r.top), h: Math.round(r.height), x: Math.round(r.left), w: Math.round(r.width),
        top: cs.top, transform: cs.transform, loaded: document.body.classList.contains('loaded'),
        mid: Math.round((t.bottom + m.top) / 2), titleB: Math.round(t.bottom), maniT: Math.round(m.top)
      };
    })()`);
    out.push(s);
    await new Promise(r => setTimeout(r, 500));
  }
  console.log(lang, JSON.stringify(out));
}
ws.close();
