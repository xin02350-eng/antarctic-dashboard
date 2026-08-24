const pages = ['sensors.html', 'telemetry.html', 'analysis.html'];
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

for (const p of pages) {
  await send('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 2, mobile: true });
  await send('Page.navigate', { url: 'http://127.0.0.1:8765/' + p + '?v=' + Date.now() });
  await new Promise(r => setTimeout(r, 3200));
  await ev(`if (window.anxApplyLang) window.anxApplyLang('zh'); true`);
  await new Promise(r => setTimeout(r, 250));
  const info = await ev(`(() => {
    const r = el => { if (!el) return null; const b = el.getBoundingClientRect(); const s = getComputedStyle(el); return { h: Math.round(b.height), top: Math.round(b.top), bottom: Math.round(b.bottom), minH: s.minHeight, height: s.height, overflow: s.overflow, display: s.display }; };
    return {
      body: r(document.body),
      app: r(document.querySelector('.app')),
      main: r(document.querySelector('main')),
      header: r(document.querySelector('.mission-header')),
      grid: r(document.querySelector('.sensor-grid, .panel, .analysis-container')),
      sh: document.documentElement.scrollHeight
    };
  })()`);
  console.log(p + ' ' + JSON.stringify(info, null, 1));
}
ws.close();
