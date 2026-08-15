import { writeFileSync, mkdirSync } from 'node:fs';
mkdirSync(new URL('./v49_37_screenshots/', import.meta.url), { recursive: true });

const list = await fetch('http://127.0.0.1:9222/json/list').then(r => r.json());
const page = list.find(t => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const pending = new Map(); let errors = [];
function send(method, params = {}) { return new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); }); }
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); }
  else if (m.method === 'Runtime.exceptionThrown') { errors.push((m.params.exceptionDetails.exception && m.params.exceptionDetails.exception.description || m.params.exceptionDetails.text || '').split('\n')[0]); }
  else if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') { errors.push('LOG: ' + m.params.entry.text.slice(0, 200)); }
};
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
await send('Runtime.enable'); await send('Log.enable'); await send('Network.setCacheDisabled', { cacheDisabled: true });
const ev = async e => { const rr = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); return rr.result ? rr.result.value : null; };
const wait = ms => new Promise(r => setTimeout(r, ms));

async function run(width, height, lang, tag) {
  errors.length = 0;
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 800 });
  await send('Page.navigate', { url: 'http://127.0.0.1:8765/index.html?v=' + Date.now() });
  await wait(6500);
  await ev('window.anxApplyLang && window.anxApplyLang(' + JSON.stringify(lang) + '); true');
  await wait(500);
  const state = await ev(`(() => {
    const btn = document.getElementById('exploreBtn');
    const manifesto = document.querySelector('.manifesto');
    const hero = document.querySelector('.hero');
    const h1 = document.querySelector('.hero h1');
    if (!btn || !manifesto || !h1) return { err: 'missing elements', btn: !!btn, manifesto: !!manifesto, h1: !!h1 };
    const b = btn.getBoundingClientRect();
    const m = manifesto.getBoundingClientRect();
    const h = hero.getBoundingClientRect();
    const t = h1.getBoundingClientRect();
    const cs = getComputedStyle(btn);
    const arrowCs = getComputedStyle(btn.querySelector('b'));
    const ckCs = getComputedStyle(btn.querySelector('.ck1'));
    const beforeCs = getComputedStyle(btn, '::before');
    const pulseCs = getComputedStyle(btn.querySelector('.pulse'));
    return {
      btn: { x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height) },
      title: { x: Math.round(t.left), top: Math.round(t.top), bottom: Math.round(t.bottom) },
      manifesto: { x: Math.round(m.left), y: Math.round(m.top), bottom: Math.round(m.bottom) },
      hero: { y: Math.round(h.top), bottom: Math.round(h.bottom) },
      btnBelowTitle: t.bottom < b.top,
      btnAboveManifesto: b.bottom < m.top,
      btnLeftAlignedWithTitle: Math.abs(b.left - t.left) <= 1,
      btnCenterY: Math.round(b.top + b.height / 2),
      midpoint: Math.round((t.bottom + m.top) / 2),
      btnCenterNearMidpoint: Math.abs((b.top + b.height / 2) - (t.bottom + m.top) / 2) <= 25,
      btnAnim: cs.animationName,
      arrowAnim: arrowCs.animationName,
      cornerAnim: ckCs.animationName,
      scanAnim: beforeCs.animationName,
      pulseAnim: pulseCs.animationName,
      scrollW: document.documentElement.scrollWidth,
      innerW: window.innerWidth
    };
  })()`);
  const shot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  writeFileSync(new URL('./v49_37_screenshots/' + tag + '.png', import.meta.url), Buffer.from(shot.data, 'base64'));
  return { state, errors: [...errors] };
}

const out = {
  desktopZh: await run(1920, 1080, 'zh', '1920-zh'),
  desktopEn: await run(1920, 1080, 'en', '1920-en'),
  laptop: await run(1366, 768, 'zh', '1366-zh'),
  tablet: await run(1024, 768, 'zh', '1024-tablet'),
  tabletPortrait: await run(768, 1024, 'zh', '768-tablet-portrait'),
  mobile: await run(390, 844, 'zh', '390-mobile')
};
writeFileSync(new URL('./v4937_check.json', import.meta.url), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
ws.close();
