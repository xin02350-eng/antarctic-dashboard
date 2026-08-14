import { writeFileSync, mkdirSync } from 'node:fs';
mkdirSync(new URL('./v49_20_screenshots/', import.meta.url), { recursive: true });

const list = await fetch('http://127.0.0.1:9222/json/list').then(r => r.json());
const page = list.find(t => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const pending = new Map(); let errors = [];
function send(method, params = {}) { return new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); }); }
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); }
  else if (m.method === 'Runtime.exceptionThrown') { errors.push((m.params.exceptionDetails.exception && m.params.exceptionDetails.exception.description || m.params.exceptionDetails.text || '').split('\n')[0]); }
  else if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') { errors.push('LOG: ' + m.params.entry.text.slice(0, 180)); }
};
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
await send('Runtime.enable'); await send('Log.enable'); await send('Network.setCacheDisabled', { cacheDisabled: true });
const ev = async e => (await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true })).result.value;
const wait = ms => new Promise(r => setTimeout(r, ms));

const probe = `(() => {
  const g = window.__globe;
  const an = document.querySelector('.an-label');
  let anInfo = null;
  if (an) {
    const b = an.querySelector('b'); const sp = an.querySelector('span');
    const r = an.getBoundingClientRect();
    anInfo = {
      bText: b ? b.textContent.trim() : null,
      spanText: sp ? sp.textContent.trim() : null,
      bFontSize: b ? getComputedStyle(b).fontSize : null,
      spanFontSize: sp ? getComputedStyle(sp).fontSize : null,
      bWeight: b ? getComputedStyle(b).fontWeight : null,
      rect: [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)]
    };
  }
  // canvas label (nanjing/northeast) pixel extent
  const lc = document.getElementById('leaderCv');
  let labelPx = null;
  if (lc) {
    const ctx = lc.getContext('2d');
    const img = ctx.getImageData(0, 0, lc.width, lc.height).data;
    let minX = 1e9, maxX = -1, minY = 1e9, maxY = -1, n = 0;
    for (let y = 0; y < lc.height; y += 2) {
      for (let x = 0; x < lc.width; x += 2) {
        const i = (y * lc.width + x) * 4;
        if (img[i + 3] > 20) { n++; if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
      }
    }
    labelPx = n ? { n, bbox: [minX, minY, maxX, maxY] } : { n: 0 };
  }
  return {
    ready: !!window.__globeReady,
    rotationY: g ? +g.rotation.y.toFixed(3) : null,
    landGJ: !!window.__landGJ,
    earthLand: window.__earthLand,
    texW: window.__earthTexW,
    an: anInfo,
    canvasLabels: labelPx,
    viewport: [window.innerWidth, window.innerHeight],
    lang: window.anxCurrentLang
  };
})()`;

const out = {};
const cases = [
  [1920, 1080, 'zh', 'index-1920x1080-zh.png'],
  [1920, 1080, 'en', 'index-1920x1080-en.png'],
  [1366, 768, 'zh', 'index-1366x768-zh.png'],
  [820, 1180, 'zh', 'index-820x1180-tablet-zh.png'],
  [390, 844, 'zh', 'index-390x844-mobile-zh.png']
];

for (const [w, h, lang, file] of cases) {
  errors.length = 0;
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w <= 500 });
  await send('Page.navigate', { url: 'http://127.0.0.1:8765/index.html?v=' + Date.now() });
  await wait(9000);
  await ev('if (window.__globe) window.__globe.rotation.y = 0.6; if (window.anxApplyLang) window.anxApplyLang(' + JSON.stringify(lang) + '); true');
  await wait(350);
  const m = await ev(probe);
  m.errors = [...errors];
  m.resolution = w + 'x' + h;
  out[file] = m;
  const shot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  writeFileSync(new URL('./v49_20_screenshots/' + file, import.meta.url), Buffer.from(shot.data, 'base64'));
  console.log(file, JSON.stringify(m));
}

writeFileSync(new URL('./v4920_check.json', import.meta.url), JSON.stringify(out, null, 2));
ws.close();
