import { writeFileSync, mkdirSync } from 'node:fs';
mkdirSync(new URL('./v49_28_screenshots/', import.meta.url), { recursive: true });

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

async function waitTemp() {
  for (let i = 0; i < 40; i++) {
    const ok = await ev(`(() => !!(window.__tempBuilt && window.__tempSamples && window.__tempSamples.length && window.__landGJ))()`);
    if (ok) return true;
    await wait(400);
  }
  return false;
}

const run = async (width, height, lang, tag) => {
  errors.length = 0;
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 800 });
  await send('Page.navigate', { url: 'http://127.0.0.1:8765/index.html?v=' + Date.now() });
  const ready = await waitTemp();
  await wait(1000);
  await ev('window.anxApplyLang && window.anxApplyLang(' + JSON.stringify(lang) + '); true');
  await wait(300);
  const m = await ev(`(() => {
    const cv = window.__lineCv;
    const ctx = cv.getContext('2d');
    const w = cv.width, h = cv.height;
    function px(lat, lon) {
      const x = Math.round((lon + 180) / 360 * w);
      const y = Math.round((lat + 90) / 180 * h);
      const d = ctx.getImageData(x, y, 1, 1).data;
      return [d[0], d[1], d[2]];
    }
    return {
      w, h,
      tempSamples: (window.__tempSamples || []).map(s => ({ lat: s.lat, lng: s.lng, t: s.t })),
      tempBuilt: !!window.__tempBuilt,
      earthIce: window.__earthIce,
      samples: {
        nanjing: px(31.9, 118.8),
        northeast: px(45.75, 126.65),
        antarctica: px(-82, 70),
        pacific: px(0, -150),
        atlantic: px(30, -40)
      }
    };
  })()`);
  m.ready = ready;
  m.errors = [...errors];
  const shot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  writeFileSync(new URL('./v49_28_screenshots/index-' + tag + '.png', import.meta.url), Buffer.from(shot.data, 'base64'));
  return m;
};

const out = {
  zh1920: await run(1920, 1080, 'zh', '1920-zh'),
  zh2560: await run(2560, 1440, 'zh', '2560-zh'),
  en1920: await run(1920, 1080, 'en', '1920-en')
};
writeFileSync(new URL('./v4928_check.json', import.meta.url), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
ws.close();
