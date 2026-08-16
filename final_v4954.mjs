import { writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const shotDir = join(tmpdir(), 'v4954_shots');
mkdirSync(shotDir, { recursive: true });

const list = await fetch('http://127.0.0.1:9222/json/list').then(r => r.json());
const page = list.find(t => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const pending = new Map();
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { const q = pending.get(m.id); pending.delete(m.id); m.error ? q.rej(new Error(JSON.stringify(m.error))) : q.res(m.result); } };
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
await send('Runtime.enable');
await send('Page.enable');
const ev = async e => { const rr = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); return rr.result ? rr.result.value : null; };
const wait = ms => new Promise(r => setTimeout(r, ms));

const cases = [
  ['1920-zh', 1920, 1080, 'zh'],
  ['1920-en', 1920, 1080, 'en'],
  ['1366-zh', 1366, 768, 'zh'],
  ['390-zh', 390, 844, 'zh'],
  ['375-zh', 375, 812, 'zh']
];
const results = {};
for (const [tag, w, h, lang] of cases) {
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 800 });
  await send('Page.navigate', { url: 'http://127.0.0.1:8765/index.html?v=' + Date.now() });
  await wait(6500);
  await ev(`window.anxApplyLang && window.anxApplyLang(${JSON.stringify(lang)}); true`);
  await wait(500);
  const s = await ev(`(() => {
    const btn = document.getElementById('exploreBtn');
    const t = document.querySelector('.hero h1').getBoundingClientRect();
    const m = document.querySelector('.manifesto').getBoundingClientRect();
    const b = btn.getBoundingClientRect();
    const p = btn.querySelector('.explore-panel').getBoundingClientRect();
    const o = getComputedStyle(btn, '::before');
    const orb = { l: Math.round(b.left + parseFloat(o.left)), r: Math.round(b.right - parseFloat(o.right)), t: Math.round(b.top + parseFloat(o.top)), b: Math.round(b.bottom - parseFloat(o.bottom)) };
    return {
      btn: { x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height) },
      panel: { x: Math.round(p.left), y: Math.round(p.top), w: Math.round(p.width), h: Math.round(p.height) },
      orbit: orb,
      mid: Math.round((t.bottom + m.top) / 2),
      centerY: Math.round(b.top + b.height / 2),
      scrollW: document.documentElement.scrollWidth,
      innerW: window.innerWidth,
      anims: [...btn.querySelectorAll('*')].flatMap(el => [...el.getAnimations()].map(a => a.animationName)).filter((v, i, a) => a.indexOf(v) === i)
    };
  })()`);
  results[tag] = s;
  console.log(tag + ' ' + JSON.stringify(s));
}

// Freeze-phase captures at 1920 zh for user review
await send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: 'http://127.0.0.1:8765/index.html?v=' + Date.now() });
await wait(6500);
await ev(`window.anxApplyLang && window.anxApplyLang('zh'); true`);
await wait(500);

const setPhase = async phases => ev(`(() => {
  const btn = document.getElementById('exploreBtn');
  [...btn.querySelectorAll('*')].forEach(el => el.getAnimations().forEach(a => { a.pause(); a.currentTime = ${phases['*'] || 0}; }));
  const names = ${JSON.stringify(Object.keys(phases))};
  [...btn.querySelectorAll('*')].forEach(el => el.getAnimations().forEach(a => {
    if (names.includes(a.animationName)) a.currentTime = phases[a.animationName];
  }));
  return true;
})()`);

const rect = await ev(`(() => { const b = document.getElementById('exploreBtn').getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; })()`);
const clip = { x: Math.round(rect.x - 30), y: Math.round(rect.y - 14), width: Math.round(rect.w + 40), height: Math.round(rect.h + 28), scale: 1 };

await setPhase({ '*': 0 });
await wait(150);
let cap = await send('Page.captureScreenshot', { format: 'png', clip });
writeFileSync(join(shotDir, 'v4954_rest.png'), Buffer.from(cap.data, 'base64'));

await setPhase({ txtSweep: 1850, flowCore: 1850, flowBody: 1850, tipFlash: 2260, tipGlint: 2260, trail1: 2000, trail2: 1900, trail3: 1800 });
await wait(150);
cap = await send('Page.captureScreenshot', { format: 'png', clip });
writeFileSync(join(shotDir, 'v4954_textsweep_arrow.png'), Buffer.from(cap.data, 'base64'));

await setPhase({ txtSweep: 0, flowCore: 0, flowBody: 0, tipFlash: 0, tipGlint: 0, trail1: 0, trail2: 0, trail3: 0 });
await wait(150);
cap = await send('Page.captureScreenshot', { format: 'png', clip });
writeFileSync(join(shotDir, 'v4954_pulse.png'), Buffer.from(cap.data, 'base64'));

await setPhase({ txtSweep: 0, flowCore: 0, flowBody: 0, tipFlash: 0, tipGlint: 0, trail1: 0, trail2: 0, trail3: 0, flowBorder: 1100 });
await wait(150);
cap = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync(join(shotDir, 'v4954_full.png'), Buffer.from(cap.data, 'base64'));

console.log('SHOTS ' + shotDir);
ws.close();
