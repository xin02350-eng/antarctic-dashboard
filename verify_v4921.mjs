import { writeFileSync, mkdirSync } from 'node:fs';
mkdirSync(new URL('./v49_21_screenshots/', import.meta.url), { recursive: true });

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
const ev = async e => (await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true })).result.value;
const wait = ms => new Promise(r => setTimeout(r, ms));

async function waitReady() {
  for (let i = 0; i < 40; i++) {
    const ok = await ev(`(() => {
      return !!(window.__seaIceFeats && window.__seaIceFeats.length && window.__earthIce && window.__riverFeats && window.__landGJ);
    })()`);
    if (ok) return true;
    await wait(500);
  }
  return false;
}

const run = async (width, height, lang, tag) => {
  errors.length = 0;
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 800 });
  await send('Page.navigate', { url: 'http://127.0.0.1:8765/index.html?v=' + Date.now() });
  const ready = await waitReady();
  await wait(1200);
  await ev('window.anxApplyLang && window.anxApplyLang(' + JSON.stringify(lang) + '); true');
  await wait(400);
  const m = await ev(`(() => {
    const cv = window.__lineCv;
    if (!cv) return { err: 'no lineCv' };
    const ctx = cv.getContext('2d');
    const w = cv.width, h = cv.height;
    function regionStats(y0, y1, label) {
      const y = Math.max(0, Math.min(h - 1, Math.round((y0 + y1) / 2)));
      const d = ctx.getImageData(0, y, w, 1).data;
      let nearWhite = 0, iceBlue = 0, dark = 0;
      for (let x = 0; x < w; x++) {
        const i = x * 4, r = d[i], g = d[i + 1], b = d[i + 2];
        if (r > 215 && g > 230 && b > 235) nearWhite++;
        else if (r > 130 && b > 150 && b > r + 12) iceBlue++;
        else if (r < 70 && g < 80 && b < 100) dark++;
      }
      return { label, nearWhite, iceBlue, dark, total: w };
    }
    return {
      w, h,
      seaIceFeats: (window.__seaIceFeats || []).length,
      landGJFeats: window.__landGJ ? window.__landGJ.features.length : 0,
      landIceFeats: (window.__landIceFeats || []).length,
      iceGJFeats: window.__iceGJ ? window.__iceGJ.features.length : 0,
      geoLineFeats: (window.__geoLineFeats || []).length,
      riverFeats: (window.__riverFeats || []).length,
      earthIce: !!window.__earthIce,
      earthLand: window.__earthLand,
      rows: [
        regionStats(h * 0.03, h * 0.08, 'antarctica-ice'),
        regionStats(h * 0.14, h * 0.18, 'antarctic-seaice'),
        regionStats(h * 0.25, h * 0.30, 'mid-ocean'),
        regionStats(h * 0.50, h * 0.55, 'equator'),
        regionStats(h * 0.82, h * 0.88, 'arctic-seaice'),
        regionStats(h * 0.93, h * 0.96, 'arctic-cap')
      ]
    };
  })()`);
  m.ready = ready;
  m.errors = [...errors];
  const shot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  writeFileSync(new URL('./v49_21_screenshots/index-' + tag + '.png', import.meta.url), Buffer.from(shot.data, 'base64'));
  return m;
};

const out = {
  zh1920: await run(1920, 1080, 'zh', '1920-zh'),
  zh1366: await run(1366, 768, 'zh', '1366-zh'),
  tablet: await run(1024, 768, 'zh', '1024-tablet'),
  mobile: await run(390, 844, 'zh', '390-mobile'),
  en1920: await run(1920, 1080, 'en', '1920-en')
};
writeFileSync(new URL('./v4921_check.json', import.meta.url), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
ws.close();
