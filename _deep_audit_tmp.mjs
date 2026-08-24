const pages = ['index.html','network.html','dashboard.html','sensors.html','telemetry.html','hardware.html','analysis.html','location.html','dashboard-a02.html','sensors-a02.html','telemetry-a02.html','hardware-a02.html','analysis-a02.html','location-a02.html','dashboard-a03.html','sensors-a03.html','telemetry-a03.html','hardware-a03.html','analysis-a03.html','location-a03.html'];

const list = await fetch('http://127.0.0.1:9222/json/list').then(r => r.json());
const page = list.find(t => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
ws.onmessage = e => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    const q = pending.get(m.id);
    pending.delete(m.id);
    m.error ? q.rej(new Error(JSON.stringify(m.error))) : q.res(m.result);
  }
};
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
const send = (method, params = {}) => new Promise((res, rej) => {
  const i = ++id;
  pending.set(i, { res, rej });
  ws.send(JSON.stringify({ id: i, method, params }));
});
const ev = async ex => {
  const r = await send('Runtime.evaluate', { expression: ex, returnByValue: true, awaitPromise: true });
  return r.result ? r.result.value : null;
};
await send('Runtime.enable');
await send('Page.enable');

async function audit(p, w, h) {
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 2, mobile: true });
  await send('Page.navigate', { url: 'http://127.0.0.1:8765/' + p + '?v=' + Date.now() });
  for (let k = 0; k < 20; k++) {
    await new Promise(r => setTimeout(r, 300));
    const cur = await ev(`location.pathname + '|' + document.readyState`);
    if (cur && cur.startsWith('/' + p) && cur.endsWith('complete')) break;
  }
  await new Promise(r => setTimeout(r, 800));
  await ev(`if (window.anxApplyLang) window.anxApplyLang('zh'); true`);
  await new Promise(r => setTimeout(r, 200));
  const info = await ev(`(() => {
    const cw = document.documentElement.clientWidth, ch = document.documentElement.clientHeight;
    const els = [];
    document.querySelectorAll('body *').forEach(el => {
      const s = getComputedStyle(el);
      if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity || 1) < 0.05) return;
      const r = el.getBoundingClientRect();
      if (r.width < 8 || r.height < 8) return;
      els.push({ el, r, s });
    });
    function inScroller(el) {
      let p = el.parentElement;
      while (p) {
        const st = getComputedStyle(p);
        if ((st.overflowX === 'auto' || st.overflowX === 'scroll' || st.overflowY === 'auto' || st.overflowY === 'scroll' || st.overflowX === 'hidden' || st.overflowY === 'hidden')) return true;
        p = p.parentElement;
      }
      return false;
    }
    const overlaps = [];
    for (let i = 0; i < els.length; i++) {
      for (let j = i + 1; j < els.length; j++) {
        const a = els[i], b = els[j];
        if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
        const sa = a.s, sb = b.s;
        if (sa.position === 'fixed' || sb.position === 'fixed' || sa.position === 'absolute' || sb.position === 'absolute') continue;
        if (sa.pointerEvents === 'none' || sb.pointerEvents === 'none') continue;
        if (inScroller(a.el) || inScroller(b.el)) continue;
        const ix = Math.max(0, Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left));
        const iy = Math.max(0, Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top));
        const inter = ix * iy;
        const minArea = Math.min(a.r.width * a.r.height, b.r.width * b.r.height);
        if (inter > 0.15 * minArea && minArea > 2500) {
          overlaps.push(String(a.el.className).slice(0, 24) + '|' + String(b.el.className).slice(0, 24));
        }
      }
    }
    const clipped = [];
    els.forEach(o => {
      if (o.s.whiteSpace === 'nowrap' && o.s.overflowX === 'hidden' && o.el.scrollWidth > o.el.clientWidth + 2 && !o.s.textOverflow.includes('ellipsis')) {
        clipped.push(String(o.el.className).slice(0, 30) + ':' + o.el.textContent.slice(0, 16));
      }
    });
    const out = [];
    els.forEach(o => {
      if (String(o.el.className).includes('leaflet-tile') || o.el.tagName === 'path' || o.el.tagName === 'svg') return;
      if (o.r.right > cw + 1 || o.r.left < -1 || o.r.bottom > ch + 1) {
        if (!inScroller(o.el) && o.s.position !== 'fixed') out.push(String(o.el.className).slice(0, 30) + ' R' + Math.round(o.r.right) + ' B' + Math.round(o.r.bottom));
      }
    });
    return { overlaps: overlaps.slice(0, 8), clipped: clipped.slice(0, 8), out: out.slice(0, 8) };
  })()`);
  const flag = (info.overlaps.length || info.clipped.length || info.out.length) ? ' !!' : ' ok';
  console.log(p + '@' + w + flag + ' ' + JSON.stringify(info));
}

for (const p of pages) { await audit(p, 844, 390); }
for (const p of pages) { await audit(p, 640, 360); }
ws.close();
