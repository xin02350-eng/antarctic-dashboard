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
await new Promise(r => setTimeout(r, 5000));

const ev = async e => { const rr = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); return rr.result ? rr.result.value : null; };

const info = await ev(`(() => {
  const s = [...document.querySelectorAll('.btn-txt')].find(x => x.getClientRects().length);
  const cs = getComputedStyle(s);
  const btn = document.getElementById('exploreBtn');
  const b = btn.getBoundingClientRect();
  const a = s.getAnimations().find(x => x.animationName === 'txtShimmer');
  return {
    anim: cs.animationName,
    state: a ? a.playState : 'none',
    pos: cs.backgroundPosition,
    size: cs.backgroundSize,
    clip: cs.backgroundClip,
    fill: cs.webkitTextFillColor,
    btnRect: { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }
  };
})()`);
console.log(JSON.stringify(info, null, 2));

// Rest state: pause at the hold position (band off-screen left).
await ev(`(() => { const s = [...document.querySelectorAll('.btn-txt')].find(x => x.getClientRects().length); s.style.animation = 'none'; s.style.backgroundPosition = '130% 0'; return true; })()`);
await new Promise(r => setTimeout(r, 120));
let shot = await send('Page.captureScreenshot', { format: 'png', clip: { x: 115, y: 650, width: 160, height: 90, scale: 1 } });
writeFileSync('./v49_50_shots/after_rest.png', Buffer.from(shot.data, 'base64'));

// Mid sweep: band centered over the text.
await ev(`(() => { const s = [...document.querySelectorAll('.btn-txt')].find(x => x.getClientRects().length); s.style.backgroundPosition = '50% 0'; return true; })()`);
await new Promise(r => setTimeout(r, 120));
shot = await send('Page.captureScreenshot', { format: 'png', clip: { x: 115, y: 650, width: 160, height: 90, scale: 1 } });
writeFileSync('./v49_50_shots/after_mid.png', Buffer.from(shot.data, 'base64'));

console.log('captured after_rest.png / after_mid.png');
ws.close();
