import { writeFileSync } from 'node:fs';

const list = await fetch('http://127.0.0.1:9222/json/list').then(r => r.json());
const page = list.find(t => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const msgId = ++id;
    pending.set(msgId, { resolve, reject });
    ws.send(JSON.stringify({ id: msgId, method, params }));
  });
}
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const p = pending.get(msg.id); pending.delete(msg.id);
    msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result);
  }
};
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
await send('Runtime.enable');
const evalJs = async (e) => (await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true })).result.value;

await send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: 'http://127.0.0.1:8765/index.html?v=' + Date.now() });
await new Promise(r => setTimeout(r, 9000));
await evalJs('window.__globe.rotation.y = 0.6; true');

const probe = await evalJs(`(() => {
  const g = window.__globe, cam = window.__camera;
  g.updateMatrixWorld(true); cam.updateMatrixWorld(true);
  const gpos = new THREE.Vector3().setFromMatrixPosition(g.matrixWorld);
  const dir = cam.position.clone().sub(gpos).normalize();
  const inv = new THREE.Matrix4().makeRotationY(-g.rotation.y);
  const local = dir.clone().applyMatrix4(inv);
  let faceLng = Math.atan2(local.z, local.x) * 180 / Math.PI - 90;
  if (faceLng < -180) faceLng += 360;
  if (faceLng > 180) faceLng -= 360;
  function ll(lat, lng) {
    const phi = (90 - lat) * Math.PI / 180;
    const theta = (90 - lng) * Math.PI / 180;
    const v = new THREE.Vector3(100 * Math.sin(phi) * Math.cos(theta), 100 * Math.cos(phi), 100 * Math.sin(phi) * Math.sin(theta));
    v.applyMatrix4(g.matrixWorld);
    const p = v.clone().project(cam);
    return { x: Math.round((p.x*0.5+0.5)*innerWidth), y: Math.round((-p.y*0.5+0.5)*innerHeight), z: +p.z.toFixed(2) };
  }
  const c = gpos.clone().project(cam);
  const cv = window.__lineCv;
  const ctx = cv.getContext('2d');
  function sample(latMin, latMax) {
    // y=(lat+90)/180*h ; south pole = y=0 (top), north = y=h (bottom)
    const y0 = Math.max(0, Math.round((latMin+90)/180*cv.height));
    const y1 = Math.min(cv.height, Math.round((latMax+90)/180*cv.height));
    const img = ctx.getImageData(0, y0, cv.width, y1 - y0).data;
    let white = 0, blue = 0, n = 0;
    const step = 12;
    for (let y = 0; y < (y1-y0); y += step) {
      for (let x = 0; x < cv.width; x += step) {
        const i = (y*cv.width + x)*4;
        const r=img[i], gg=img[i+1], b=img[i+2], a=img[i+3];
        n++;
        if (a>20 && r>215 && gg>235 && b>240) white++;
        if (b>160 && b>r+50 && gg>100) blue++;
      }
    }
    return { y0, y1, n, white, blue };
  }
  return {
    faceLng: Math.round(faceLng),
    rotationY: +g.rotation.y.toFixed(4),
    center: [Math.round((c.x*0.5+0.5)*innerWidth), Math.round((-c.y*0.5+0.5)*innerHeight)],
    nanjing: ll(31.9,118.8),
    northeast: ll(45.75,126.65),
    antarctica: ll(-82,70),
    antarcticaTex: sample(-90,-60),
    chinaTex: sample(18,53),
    arcticTex: sample(70,90)
  };
})()`);

writeFileSync(new URL('./v4916_geom.json', import.meta.url), JSON.stringify(probe, null, 2));
console.log(JSON.stringify(probe, null, 2));
ws.close();
