import { writeFileSync, mkdirSync } from 'node:fs';
mkdirSync(new URL('./v49_23_screenshots/', import.meta.url), { recursive: true });

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
  for (let i = 0; i < 50; i++) {
    const ok = await ev(`(() => !!(window.__seaIceFloeFeats && window.__seaIceFloeFeats.length && window.__seaIceFeats && window.__seaIceFeats.length && window.__earthIce && window.__landGJ))()`);
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
  await wait(1400);
  await ev('window.anxApplyLang && window.anxApplyLang(' + JSON.stringify(lang) + '); true');
  await wait(400);
  const m = await ev(`(() => {
    const cv = window.__lineCv;
    if (!cv) return { err: 'no lineCv' };
    const ctx = cv.getContext('2d');
    const w = cv.width, h = cv.height;
    function px(lat, lon) {
      const x = Math.round((lon + 180) / 360 * w);
      const y = Math.round((lat + 90) / 180 * h);
      const d = ctx.getImageData(x, y, 1, 1).data;
      return [d[0], d[1], d[2]];
    }
    function rowStat(y) {
      const yy = Math.max(0, Math.min(h - 1, Math.round(y)));
      const d = ctx.getImageData(0, yy, w, 1).data;
      let bright = 0, dark = 0, runs = 0, prev = false;
      for (let x = 0; x < w; x++) {
        const i = x * 4, r = d[i], g = d[i + 1], b = d[i + 2];
        const br = (r > 215 && g > 230 && b > 235) || (r > 130 && b > 150 && b > r + 12);
        if (br) bright++; else if (r < 70 && g < 80 && b < 100) dark++;
        if (br && !prev) runs++;
        prev = br;
      }
      return { bright, dark, runs, total: w };
    }
    const floes = window.__seaIceFloeFeats || [];
    let inPatch = 0, outPatch = 0;
    for (const f of floes) {
      const ring = f.geometry.coordinates[0];
      const lons = ring.map(p => p[0]), lats = ring.map(p => p[1]);
      const mlon = (Math.min(...lons) + Math.max(...lons)) / 2;
      const mlat = (Math.min(...lats) + Math.max(...lats)) / 2;
      if (mlon >= 69 && mlon <= 141 && mlat >= 71 && mlat <= 89) inPatch++; else outPatch++;
    }
    return {
      w, h,
      floeFeats: floes.length,
      floeInPatch: inPatch,
      floeOutPatch: outPatch,
      seaIceFeats: (window.__seaIceFeats || []).length,
      earthIce: !!window.__earthIce,
      samples: {
        arcticPatch: px(82, 105),
        arcticOutside: px(82, 0),
        arcticOutside2: px(82, 200),
        china: px(35, 105),
        antarctica: px(-80, 90)
      },
      rows: {
        arcticLat82: rowStat(h * (82 + 90) / 180),
        chinaLat35: rowStat(h * (35 + 90) / 180)
      }
    };
  })()`);
  m.ready = ready;
  m.errors = [...errors];
  const shot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  writeFileSync(new URL('./v49_23_screenshots/index-' + tag + '.png', import.meta.url), Buffer.from(shot.data, 'base64'));
  return m;
};

const out = {
  zh1920: await run(1920, 1080, 'zh', '1920-zh'),
  zh2560: await run(2560, 1440, 'zh', '2560-zh'),
  tablet: await run(1024, 768, 'zh', '1024-tablet'),
  mobile: await run(390, 844, 'zh', '390-mobile'),
  en1920: await run(1920, 1080, 'en', '1920-en')
};
writeFileSync(new URL('./v4923_check.json', import.meta.url), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
ws.close();
