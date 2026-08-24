import { writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const shotDir = join(tmpdir(), 'mobile_v15');
mkdirSync(shotDir, { recursive: true });
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
for (const p of ['index.html','network.html','dashboard.html','sensors.html','telemetry.html','hardware.html','analysis.html','location.html']) {
  await send('Page.navigate', { url: 'http://127.0.0.1:8765/' + p + '?v=' + Date.now() });
  for (let k = 0; k < 20; k++) { await new Promise(r => setTimeout(r, 300)); const cur = await ev(`location.pathname + '|' + document.readyState`); if (cur && cur.startsWith('/' + p) && cur.endsWith('complete')) break; }
  await new Promise(r => setTimeout(r, 500));
  await ev(`if (window.anxApplyLang) window.anxApplyLang('zh'); true`);
  await new Promise(r => setTimeout(r, 200));
  const cap = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(shotDir, p.replace('.html', '') + '.png'), Buffer.from(cap.data, 'base64'));
  console.log('shot', p);
}
console.log('SHOTS ' + shotDir);
ws.close();
