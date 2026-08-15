import { writeFileSync, mkdirSync } from 'node:fs';

mkdirSync(new URL('./v49_52_shots/', import.meta.url), { recursive: true });

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

const state = await ev(`(() => {
  const btn = document.getElementById('exploreBtn');
  const t = document.querySelector('.hero h1').getBoundingClientRect();
  const m = document.querySelector('.manifesto').getBoundingClientRect();
  const b = btn.getBoundingClientRect();
  const span = [...btn.querySelectorAll('.btn-txt')].find(x => x.getClientRects().length);
  const s = span.getBoundingClientRect();
  const arr = btn.querySelector('b').getBoundingClientRect();
  const cs = getComputedStyle(span);
  const shine = span.querySelector('.explore-shine');
  const shineCs = getComputedStyle(shine);
  const base = span.querySelector('.explore-base');
  const baseRect = base.getBoundingClientRect();
  const shineRect = shine.getBoundingClientRect();
  const aCs = getComputedStyle(btn, '::after');
  return {
    lang: document.documentElement.getAttribute('data-lang'),
    btn: { x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height) },
    txt: { x: Math.round(s.left), y: Math.round(s.top), w: Math.round(s.width), h: Math.round(s.height) },
    baseRect: { x: Math.round(baseRect.left), y: Math.round(baseRect.top), w: Math.round(baseRect.width), h: Math.round(baseRect.height) },
    shineRect: { x: Math.round(shineRect.left), y: Math.round(shineRect.top), w: Math.round(shineRect.width), h: Math.round(shineRect.height) },
    title: { top: Math.round(t.top), bottom: Math.round(t.bottom) },
    manifesto: { top: Math.round(m.top), bottom: Math.round(m.bottom) },
    midpoint: Math.round((t.bottom + m.top) / 2),
    btnCenterY: Math.round(b.top + b.height / 2),
    font: cs.fontSize,
    lh: cs.lineHeight,
    ls: cs.letterSpacing,
    shineClip: shineCs.clipPath,
    shineAnim: shineCs.animationName,
    baseAnim: getComputedStyle(base).animationName,
    framePadding: { left: 18, right: 18, top: 10, bottom: 10 }
  };
})()`);
console.log(JSON.stringify(state, null, 2));

// Sample clip-path over time
const clips = [];
for (let i = 0; i < 40; i++) {
  const c = await ev(`(() => {
    const s = [...document.querySelectorAll('.btn-txt')].find(x => x.getClientRects().length);
    const sh = s.querySelector('.explore-shine');
    const a = sh.getAnimations().find(x => x.animationName === 'txtSweep');
    return { clip: getComputedStyle(sh).clipPath, state: a ? a.playState : 'none', ct: a ? (a.currentTime | 0) : -1 };
  })()`);
  clips.push(c);
  await new Promise(r => setTimeout(r, 90));
}
console.log(JSON.stringify(clips));
ws.close();
