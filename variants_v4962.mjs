import { writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const shotDir = join(tmpdir(), 'v4962_variants');
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
await send('Emulation.setDeviceMetricsOverride', { width: 960, height: 420, deviceScaleFactor: 2, mobile: false });

const svgs = {
  A: `<svg width="300" height="120" viewBox="0 0 80 40" fill="none" xmlns="http://www.w3.org/2000/svg">
    <line x1="0" y1="12" x2="13" y2="12" stroke="#8fb6cf" stroke-width="2" opacity=".22"/>
    <line x1="4" y1="16.5" x2="22" y2="16.5" stroke="#8fb6cf" stroke-width="2" opacity=".36"/>
    <line x1="8" y1="24" x2="29" y2="24" stroke="#8fb6cf" stroke-width="2" opacity=".5"/>
    <line x1="0" y1="20" x2="52" y2="20" stroke="#5f87a5" stroke-width="2.6" opacity=".5"/>
    <line x1="0" y1="20" x2="52" y2="20" stroke="#9fc8de" stroke-width="1.2" opacity=".85"/>
    <line x1="32" y1="5" x2="74" y2="20" stroke="#7fb4d2" stroke-width="2" opacity=".72"/>
    <line x1="32" y1="35" x2="74" y2="20" stroke="#7fb4d2" stroke-width="2" opacity=".72"/>
    <line x1="42" y1="10" x2="64" y2="20" stroke="#d7edf7" stroke-width="1.5" opacity=".9"/>
    <line x1="42" y1="30" x2="64" y2="20" stroke="#d7edf7" stroke-width="1.5" opacity=".9"/>
    <line x1="68" y1="16" x2="80" y2="20" stroke="#eafcff" stroke-width="1.2" opacity=".8"/>
    <line x1="68" y1="24" x2="80" y2="20" stroke="#eafcff" stroke-width="1.2" opacity=".8"/>
  </svg>`,
  B: `<svg width="300" height="120" viewBox="0 0 80 40" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#5f87a5" stop-opacity="0"/>
        <stop offset=".45" stop-color="#8fc6e2" stop-opacity=".75"/>
        <stop offset="1" stop-color="#dff6ff" stop-opacity=".95"/>
      </linearGradient>
    </defs>
    <path d="M0 17 L44 17 L58 14.5 L76 20 L58 25.5 L44 23 L0 23 Z" fill="url(#bg)"/>
    <path d="M0 20 Q 22 13, 46 20" stroke="#8fb6cf" stroke-width="1.6" fill="none" opacity=".3"/>
    <circle cx="76" cy="20" r="2" fill="#eafcff"/>
  </svg>`,
  C: `<svg width="300" height="120" viewBox="0 0 80 40" fill="none" xmlns="http://www.w3.org/2000/svg">
    <line x1="0" y1="20" x2="12" y2="20" stroke="#7fa8c4" stroke-width="2" opacity=".5"/>
    <line x1="17" y1="20" x2="28" y2="20" stroke="#8fb6cf" stroke-width="2" opacity=".6"/>
    <line x1="33" y1="20" x2="46" y2="20" stroke="#9fc8de" stroke-width="2" opacity=".75"/>
    <line x1="51" y1="20" x2="62" y2="20" stroke="#c6e2f2" stroke-width="2" opacity=".9"/>
    <rect x="14" y="18.5" width="2" height="3" fill="#8fb6cf" opacity=".5"/>
    <rect x="30" y="18.5" width="2" height="3" fill="#9fc8de" opacity=".65"/>
    <rect x="48" y="18.5" width="2" height="3" fill="#c6e2f2" opacity=".8"/>
    <path d="M40 9 L64 20 L40 31" stroke="#c6e2f2" stroke-width="2" fill="none" stroke-linejoin="miter"/>
    <circle cx="68" cy="20" r="2.2" stroke="#dff6ff" stroke-width="1.4" fill="none"/>
  </svg>`
};

const html = `<html><body style="margin:0;background:#04101d;display:flex;flex-direction:column;gap:8px;padding:16px">
  ${Object.entries(svgs).map(([k, s]) => `<div style="display:flex;align-items:center;gap:10px;color:#7fa8c4;font:12px monospace">${k} ${s}</div>`).join('')}
</body></html>`;

await send('Page.navigate', { url: 'data:text/html;charset=utf-8,' + encodeURIComponent(html) });
await new Promise(r => setTimeout(r, 800));
const cap = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
writeFileSync(join(shotDir, 'variants.png'), Buffer.from(cap.data, 'base64'));

const stats = await send('Runtime.evaluate', { expression: `(() => {
  const c = document.createElement('canvas');
  c.width = 960; c.height = 420;
  const ctx = c.getContext('2d');
  const img = new Image();
  img.src = ${JSON.stringify('data:image/png;base64,' + cap.data)};
  return img.decode().then(() => {
    ctx.drawImage(img, 0, 0, 960, 420);
    const out = {};
    ['A','B','C'].forEach((k, idx) => {
      const d = ctx.getImageData(0, idx * 140 + 20, 960, 120).data;
      let n = 0, max = 0;
      for (let i = 0; i < d.length; i += 4) {
        const lum = 0.2126*d[i] + 0.7152*d[i+1] + 0.0722*d[i+2];
        if (lum > max) max = lum;
        if (lum > 120) n++;
      }
      out[k] = { n, max: +max.toFixed(1) };
    });
    return out;
  });
})()`, returnByValue: true, awaitPromise: true });
console.log(JSON.stringify(stats.result.value, null, 2));
console.log('SHOTS ' + shotDir);
ws.close();
