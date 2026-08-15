import { writeFileSync, mkdirSync } from 'node:fs';

mkdirSync(new URL('./v49_50_shots/', import.meta.url), { recursive: true });

const list = await fetch('http://127.0.0.1:9222/json/list').then(r => r.json());
const page = list.find(t => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const pending = new Map();
function send(method, params = {}) { return new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); }); }
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); }
};
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
await send('Runtime.enable');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: 'http://127.0.0.1:8765/index.html?v=' + Date.now() });
await new Promise(r => setTimeout(r, 5000));

const ev = async e => { const rr = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); return rr.result ? rr.result.value : null; };

const info = await ev(`(() => {
  const spans = [...document.querySelectorAll('.btn-txt')];
  const vis = spans.find(s => s.getClientRects().length) || spans[0];
  const cs = getComputedStyle(vis);
  const anims = vis.getAnimations().map(a => ({
    name: a.animationName,
    playState: a.playState,
    currentTime: a.currentTime,
    duration: a.effect && a.effect.getTiming ? a.effect.getTiming().duration : null,
    iterations: a.effect && a.effect.getTiming ? a.effect.getTiming().iterations : null
  }));
  return {
    lang: document.documentElement.getAttribute('data-lang'),
    visible: vis.getClientRects().length > 0,
    display: getComputedStyle(vis).display,
    clip: cs.webkitBackgroundClip + ' / ' + cs.backgroundClip,
    color: cs.color,
    fill: cs.webkitTextFillColor,
    backgroundPosition: cs.backgroundPosition,
    backgroundSize: cs.backgroundSize,
    animation: cs.animation,
    anims
  };
})()`);
console.log(JSON.stringify(info, null, 2));

// Sample background-position over ~4.5s
const samples = [];
for (let i = 0; i < 46; i++) {
  const s = await ev(`(() => {
    const spans = [...document.querySelectorAll('.btn-txt')];
    const vis = spans.find(x => x.getClientRects().length) || spans[0];
    const cs = getComputedStyle(vis);
    const a = vis.getAnimations().find(x => x.animationName === 'txtFlow' || x.animationName === 'txtShimmer');
    return { t: performance.now() | 0, pos: cs.backgroundPosition, state: a ? a.playState : 'none', ct: a ? (a.currentTime | 0) : -1 };
  })()`);
  samples.push(s);
  await new Promise(r => setTimeout(r, 100));
}
console.log(JSON.stringify(samples));

for (const [label, t] of [['t_0800', 800], ['t_1600', 1600], ['t_2500', 2500], ['t_3400', 3400]]) {
  await new Promise(r => setTimeout(r, Math.max(0, t - samples.length * 100)));
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(new URL(`./v49_50_shots/${label}.png`, import.meta.url), Buffer.from(shot.data, 'base64'));
}
console.log('screenshots saved');
ws.close();
