import { writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const shotDir = join(tmpdir(), 'v5058');
mkdirSync(shotDir, { recursive: true });

const list = await fetch('http://127.0.0.1:9222/json/list').then(r => r.json());
const page = list.find(t => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const pending = new Map();
const errors = [];
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { const q = pending.get(m.id); pending.delete(m.id); m.error ? q.rej(new Error(JSON.stringify(m.error))) : q.res(m.result); } if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails?.text || '?'); };
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async ex => { const r = await send('Runtime.evaluate', { expression: ex, returnByValue: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails)); return r.result ? r.result.value : null; };
await send('Runtime.enable');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: 'http://127.0.0.1:8765/network.html?v=' + Date.now() });
await new Promise(r => setTimeout(r, 5500));
await ev(`if (window.anxApplyLang) window.anxApplyLang('zh'); true`);
await new Promise(r => setTimeout(r, 700));
const m = await ev(`(() => ({
  kRecords: document.getElementById('kRecords').textContent,
  teleV: document.getElementById('teleV').textContent,
  teleT: document.getElementById('teleT').textContent,
  teleH: document.getElementById('teleH').textContent,
  uptime: document.getElementById('uptime').textContent,
  lastSync: document.getElementById('lastSync').textContent.trim(),
  sparkVal: document.getElementById('sparkVal').textContent,
  noScroll: document.documentElement.scrollHeight <= innerHeight + 1
}))()`);
console.log(JSON.stringify(m));
const cap = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync(join(shotDir, 'v558_1920_zh.png'), Buffer.from(cap.data, 'base64'));
console.log('JS_ERRORS ' + JSON.stringify(errors));
ws.close();
