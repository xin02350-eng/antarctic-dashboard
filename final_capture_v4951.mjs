import { writeFileSync } from 'node:fs';

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

async function shot(name) {
  const rect = await ev(`(() => {
    const s = [...document.querySelectorAll('.btn-txt')].find(x => x.getClientRects().length);
    const b = document.getElementById('exploreBtn').getBoundingClientRect();
    const r = s.getBoundingClientRect();
    return { bx: b.x, by: b.y, bw: b.width, bh: b.height, x: r.x, y: r.y, w: r.width, h: r.height };
  })()`);
  const x = Math.max(0, Math.round(rect.bx - 22));
  const y = Math.max(0, Math.round(rect.by - 22));
  const w = Math.round(rect.bw + 44);
  const h = Math.round(rect.bh + 44);
  const s = await send('Page.captureScreenshot', { format: 'png', clip: { x, y, width: w, height: h, scale: 1 } });
  writeFileSync('./v49_51_shots/' + name, Buffer.from(s.data, 'base64'));
  console.log(name, JSON.stringify(rect));
}

await ev(`(() => { const s = [...document.querySelectorAll('.btn-txt')].find(x => x.getClientRects().length); s.style.animation = 'none'; s.style.backgroundPosition = '130% 0'; return true; })()`);
await new Promise(r => setTimeout(r, 120));
await shot('zh_rest.png');
await ev(`(() => { const s = [...document.querySelectorAll('.btn-txt')].find(x => x.getClientRects().length); s.style.backgroundPosition = '50% 0'; return true; })()`);
await new Promise(r => setTimeout(r, 120));
await shot('zh_mid.png');

await ev(`window.anxApplyLang && window.anxApplyLang('en'); true`);
await new Promise(r => setTimeout(r, 400));
await ev(`(() => { const s = [...document.querySelectorAll('.btn-txt')].find(x => x.getClientRects().length); s.style.animation = 'none'; s.style.backgroundPosition = '130% 0'; return true; })()`);
await new Promise(r => setTimeout(r, 120));
await shot('en_rest.png');
await ev(`(() => { const s = [...document.querySelectorAll('.btn-txt')].find(x => x.getClientRects().length); s.style.backgroundPosition = '50% 0'; return true; })()`);
await new Promise(r => setTimeout(r, 120));
await shot('en_mid.png');

ws.close();
