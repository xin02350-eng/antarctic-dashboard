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
await new Promise(r => setTimeout(r, 7000));
const ev = async e => { const rr = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); return rr.result ? rr.result.value : null; };
const wait = ms => new Promise(r => setTimeout(r, ms));
for (const lang of ['zh', 'en']) {
  await ev(`window.anxApplyLang && window.anxApplyLang(${JSON.stringify(lang)}); true`);
  await wait(500);
  const s = await ev(`(() => {
    const btn = document.getElementById('exploreBtn');
    const b = btn.getBoundingClientRect();
    const span = [...btn.querySelectorAll('.btn-txt')].find(x => x.getClientRects().length);
    const t = span.getBoundingClientRect();
    const a = btn.querySelector('.explore-arrow').getBoundingClientRect();
    const p = btn.querySelector('.explore-panel').getBoundingClientRect();
    const h1 = document.querySelector('.hero h1');
    const k = document.querySelector('.kicker');
    const m = document.querySelector('.manifesto p');
    const h1r = h1.getBoundingClientRect();
    return {
      btn: { x: +b.left.toFixed(1), y: +b.top.toFixed(1), w: +b.width.toFixed(1), h: +b.height.toFixed(1) },
      text: { x: +t.left.toFixed(1), w: +t.width.toFixed(1), h: +t.height.toFixed(1) },
      arrow: { x: +a.left.toFixed(1), w: +a.width.toFixed(1), h: +a.height.toFixed(1) },
      panel: { l: +p.left.toFixed(1), r: +p.right.toFixed(1) },
      gaps: { left: +(t.left - p.left).toFixed(1), right: +(p.right - a.right).toFixed(1), textArrow: +(a.left - t.right).toFixed(1) },
      h1: { fs: getComputedStyle(h1).fontSize, lh: getComputedStyle(h1).lineHeight, top: +h1r.top.toFixed(1), bottom: +h1r.bottom.toFixed(1) },
      kicker: getComputedStyle(k).fontSize,
      manifesto: getComputedStyle(m).fontSize
    };
  })()`);
  console.log(lang, JSON.stringify(s, null, 2));
}
ws.close();
