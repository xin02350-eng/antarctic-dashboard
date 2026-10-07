const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { expandedScriptSources, bundleFor, assertCurrentBundle } = require('./helpers/runtime.cjs');
const T = require('../assets/three.min.js');
const environment = require('../js/polar-environment.js');
const camera = require('../js/polar-camera.js');
const createMast = require('../js/polar-mast.js');
const createPower = require('../js/polar-power.js');
const createSnow = require('../js/polar-snow.js');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

function element(dataset = {}) {
  const listeners = new Map();
  return {
    dataset: { ...dataset }, style: {}, hidden: true, children: [], attributes: {},
    appendChild(child) { this.children.push(child); },
    setAttribute(name, value) { this.attributes[name] = value; },
    getAttribute(name) { return this.attributes[name]; },
    addEventListener(type, handler) { listeners.set(type, handler); },
    dispatch(type, event = {}) { listeners.get(type)?.(event); },
    setPointerCapture() {}
  };
}
function sceneHarness({ reduced = false, runtimeError = false, paintError = false, presentationGate = false, reflectionError = false } = {}) {
  const elements = Object.fromEntries(['polarScene', 'sceneFallback', 'environmentStatus',
    'antennaLabel', 'sensorLabel', 'powerLabel'].map(id => [id, element()]));
  elements.polarScene.dataset.horizontalOffset = '0.18';
  const buttons = ['wide', 'close', 'top'].map(view => element({ view }));
  const windowEvents = new Map(), documentEvents = new Map(), mediaEvents = new Map(), frames = new Map();
  const messages = [], motionEvents = [], paints = [], cancellations = [];
  let sequence = 0, time = 0, environmentStatus, restores = 0, renderer, prepared = 0, reflected = 0, reflectionPending = false;
  let resources = { panorama: 'loading', snow: 'loading', crust: 'loading' };
  const parent = { postMessage(message, origin) { messages.push({ ...message, origin, paints: paints.length }); } };
  const media = { matches: reduced, addEventListener(type, handler) { mediaEvents.set(type, handler); } };
  const context2d = { fillRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, fillText() {},
    createRadialGradient: () => ({ addColorStop() {} }) };
  const document = {
    hidden: false, documentElement: { dataset: {} },
    getElementById(id) { return elements[id]; },
    createElement() { return { width: 0, height: 0, getContext: () => context2d }; },
    querySelectorAll() { return buttons; },
    addEventListener(type, handler) { documentEvents.set(type, handler); }
  };
  class Renderer {
    constructor() {
      if (runtimeError) throw new Error('WebGL unavailable');
      renderer = this; this.domElement = element(); this.shadowMap = {};
    }
    setPixelRatio() {}
    setSize() {}
    render(scene, lens) {
      if (paintError) throw new Error('Driver render failure');
      paints.push({ station: scene.getObjectByName('single-axis-observatory'), lens, reflected,
        quality: elements.polarScene.dataset.qualityState, shadowDirty: this.shadowMap.needsUpdate === true });
      this.shadowMap.needsUpdate = false;
    }
  }
  const window = {
    parent, THREE: { ...T, WebGLRenderer: Renderer }, createPolarPower: createPower, createPolarMast: createMast,
    createPolarSnow: createSnow, PolarCamera: camera,
    PolarEnvironment: { heightAt: environment.heightAt, create(_T, _renderer, _scene, status) {
      environmentStatus = status;
      return { heightAt: environment.heightAt, update() {}, restore() { restores++; },
        ...(presentationGate ? {
          prepare() { prepared++; },
          afterFrame() { if (reflectionPending) { reflected++; reflectionPending = false; } },
          presentationReady() { return !reflectionPending && Object.values(resources).every(value => value !== 'loading'); },
          degraded() { return reflectionError || Object.values(resources).includes('error'); },
          pendingWork() { return reflectionPending; }
        } : {}) };
    } },
    location: { search: '?profile=hero', origin: 'http://127.0.0.1:8765' }, innerWidth: 1440, innerHeight: 900,
    devicePixelRatio: 1, matchMedia: () => media,
    addEventListener(type, handler) { windowEvents.set(type, handler); },
    dispatchEvent(event) { if (event.type === 'polar:motion') motionEvents.push(event.detail.paused); }
  };
  vm.runInNewContext(read('js/polar-scene.js'), {
    window, document, URLSearchParams, innerWidth: 1440, innerHeight: 900, performance: { now: () => time },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
    requestAnimationFrame(handler) { frames.set(++sequence, handler); return sequence; },
    cancelAnimationFrame(id) { cancellations.push(id); frames.delete(id); }
  });
  return {
    elements, buttons, messages, paints, motionEvents, media, frames, cancellations,
    renderer: () => renderer, restores: () => restores, prepared: () => prepared,
    failPaint(value) { paintError = value; },
    status(next) { if (resources.panorama !== 'ready' && next.panorama === 'ready') reflectionPending = true;
      resources = { ...next }; environmentStatus(next); },
    frame(step = 16) { const [id, handler] = frames.entries().next().value || []; if (!handler) return false;
      frames.delete(id); handler(time += step); return true; },
    hidden(hidden) { document.hidden = hidden; documentEvents.get('visibilitychange')(); },
    visibility(visible, overrides = {}) { windowEvents.get('message')({ origin: window.location.origin, source: parent,
      data: { type: 'dms:field-visibility', visible }, ...overrides }); },
    reduced(value) { media.matches = value; mediaEvents.get('change')({ matches: value }); }
  };
}
const refining = { panorama: 'ready', snow: 'loading', crust: 'loading' };
const ready = { panorama: 'ready', snow: 'ready', crust: 'ready' };

test('the first visible frame is fully textured instead of progressively revealing unfinished materials', () => {
  const h = sceneHarness();
  h.frame();
  assert.equal(h.messages.length, 0, 'the untextured initial sky must not reveal the hero');
  assert.equal(h.paints.length,0,'no invisible untextured shader is compiled while waiting');
  h.status(refining);
  assert.equal(h.messages.length, 0, 'loaded images alone are not a completed canvas');
  h.frame();
  assert.equal(h.messages.length, 0, 'ordinary loading must never be announced as degraded');
  assert.equal(h.paints.length, 0, 'a partial sky/device/material state is not drawn');
  assert.equal(h.elements.polarScene.dataset.visibleFrameMs, undefined);
  assert.equal(h.elements.polarScene.dataset.fullQualityMs, undefined);
  assert.equal(h.elements.polarScene.dataset.environment, 'loading');
  assert.ok(h.elements.environmentStatus.textContent.includes('正在加载'));
  assert.equal(h.frames.size, 0, 'waiting for textures has no empty RAF loop');
  h.status(ready); assert.equal(h.messages.length, 0);
  h.frame(); assert.equal(h.messages[0].state, 'ready');
  assert.equal(h.messages[0].paints, 1, 'publish occurs only after the meaningful render');
  const foundation = h.paints[0].station.getObjectByName('single-foundation-flange');
  const bounds = new T.Box3().setFromObject(foundation);
  assert.ok(bounds.min.y < environment.heightAt(0, 0) && bounds.max.y > environment.heightAt(0, 0));
  h.frame(); assert.equal(h.messages.length, 1, 'steady frames do not spam the parent');
  assert.equal(h.elements.polarScene.dataset.qualityState, 'ready');
  assert.equal(h.elements.polarScene.dataset.visibleFrameMs, h.elements.polarScene.dataset.fullQualityMs);
  assert.equal(h.elements.polarScene.dataset.visibleFrameMs, h.elements.polarScene.dataset.firstDrawMs);
  assert.equal(h.elements.environmentStatus.hidden, true);
});

test('all texture completion orders prepare reflection before one complete visible render', () => {
  const orders = [['panorama', 'snow', 'crust'], ['panorama', 'crust', 'snow'], ['snow', 'panorama', 'crust'],
    ['snow', 'crust', 'panorama'], ['crust', 'panorama', 'snow'], ['crust', 'snow', 'panorama']];
  for (const order of orders) {
    const h = sceneHarness({ presentationGate: true, reduced: true });
    const status = { panorama: 'loading', snow: 'loading', crust: 'loading' };
    assert.equal(h.prepared(), 1, 'the scene starts independent details before any visible frame');
    h.frame();
    for (let index = 0; index < order.length; index++) {
      status[order[index]] = 'ready'; h.status(status);
      assert.equal(h.messages.length, 0, 'an image callback is not proof of a completed render');
      h.frame();
      assert.equal(h.messages.length, index === 2 ? 1 : 0, order.join(','));
      assert.equal(h.frames.size, 0, 'reduced motion never polls for downloading resources');
    }
    assert.equal(h.paints.length, 1); assert.equal(h.paints[0].reflected, 1);
    assert.equal(h.messages[0].state, 'ready');
    assert.equal(h.elements.polarScene.dataset.visibleFrameMs, h.elements.polarScene.dataset.fullQualityMs);
  }
});

test('real resource and reflection failures are bounded degraded outcomes, with late resources restoring quality', () => {
  const h = sceneHarness({ presentationGate: true, reduced: true }); h.frame();
  h.status({ panorama: 'error', snow: 'loading', crust: 'loading' }); h.frame();
  assert.equal(h.messages.length, 0, 'one failed resource cannot expose the others while still loading');
  assert.equal(h.frames.size, 0);
  h.status({ panorama: 'error', snow: 'ready', crust: 'error' }); h.frame();
  assert.equal(h.messages[0].state, 'degraded'); assert.equal(h.elements.polarScene.dataset.fullQualityMs, undefined);
  h.status(ready); assert.equal(h.messages.length, 1); h.frame();
  assert.equal(h.messages[1].state, 'ready'); assert.equal(h.paints.at(-1).reflected, 1);
  assert.ok(Number(h.elements.polarScene.dataset.fullQualityMs) > Number(h.elements.polarScene.dataset.visibleFrameMs));
  const failedReflection = sceneHarness({ presentationGate: true, reflectionError: true, reduced: true });
  failedReflection.status(ready); failedReflection.frame();
  assert.equal(failedReflection.messages[0].state, 'degraded');
  assert.equal(failedReflection.elements.polarScene.dataset.fullQualityMs, undefined);
  assert.equal(failedReflection.frames.size, 0);
});

test('partial failures, runtime failure and restoration retain honest accessible outcomes', () => {
  const unavailable = sceneHarness({ runtimeError: true });
  assert.equal(unavailable.messages[0].state, 'unavailable');
  assert.equal(unavailable.elements.sceneFallback.hidden, false);
  assert.ok(unavailable.buttons.every(button => button.disabled));
  const h = sceneHarness();
  h.status({ panorama: 'error', snow: 'loading', crust: 'loading' }); h.frame();
  assert.equal(h.messages[0].state, 'degraded');
  assert.equal(h.elements.polarScene.dataset.qualityState, 'degraded');
  assert.ok(h.elements.environmentStatus.textContent.includes('未完整加载'));
  h.renderer().domElement.dispatch('webglcontextlost', { preventDefault() {} });
  assert.equal(h.messages.at(-1).state, 'unavailable');
  assert.equal(h.frames.size, 0); assert.equal(h.elements.sceneFallback.hidden, false);
  const before = h.messages.length;
  h.renderer().domElement.dispatch('webglcontextrestored');
  assert.equal(h.restores(), 1); assert.equal(h.messages.length, before, 'recovery waits for an actual repaint');
  h.frame(); assert.equal(h.messages.at(-1).state, 'degraded');
  assert.equal(h.elements.sceneFallback.hidden, true);
});

test('hidden/offscreen canvases cannot announce a frame until active and reduced-motion remains paused', () => {
  const h = sceneHarness({ reduced: true });
  assert.equal(h.elements.motionToggle, undefined, 'scene no longer requires a pause control');
  assert.deepEqual(h.motionEvents, [true]);
  h.visibility(false); h.status(refining);
  assert.equal(h.frames.size, 0); assert.equal(h.messages.length, 0);
  h.visibility(true, { origin: 'https://example.com' }); assert.equal(h.frames.size, 0);
  h.hidden(true); h.visibility(true); assert.equal(h.frames.size, 0);
  h.hidden(false); h.frame(); assert.equal(h.messages.length, 0);
  h.status(ready); h.frame(); assert.equal(h.messages[0].state, 'ready');
  assert.deepEqual(h.motionEvents, [true], 'visibility does not reset the selected motion state');
  h.reduced(false); assert.deepEqual(h.motionEvents, [true, false]);
  h.reduced(true); assert.deepEqual(h.motionEvents, [true, false, true]);
});

test('initialization, repeated ready callbacks and visibility resumes never duplicate the scene RAF', () => {
  const h = sceneHarness();
  assert.equal(h.frames.size, 1, 'resize during initialization cannot start a second loop');
  for (let i = 0; i < 5; i++) {
    h.status(refining); h.status(ready); h.visibility(true);
    assert.equal(h.frames.size, 1);
  }
  h.frame(); assert.equal(h.frames.size, 1);
  h.hidden(true); assert.equal(h.frames.size, 0);
  h.status(ready); h.visibility(true); assert.equal(h.frames.size, 0);
  h.hidden(false); h.visibility(true); assert.equal(h.frames.size, 1);
  h.renderer().domElement.dispatch('webglcontextlost', { preventDefault() {} });
  assert.equal(h.frames.size, 0);
  h.renderer().domElement.dispatch('webglcontextrestored'); h.visibility(true);
  assert.equal(h.frames.size, 1);
});

test('60, 120 and 144 Hz screens keep continuous pointer dragging inside the same 60 fps paint budget', () => {
  for (const hz of [60, 120, 144]) for (const dragging of [false, true]) {
    const h = sceneHarness(); h.status(ready);
    if (dragging) h.renderer().domElement.dispatch('pointerdown', { button: 0, pointerId: 1, clientX: 0, clientY: 0 });
    for (let i = 0; i < hz * 2; i++) {
      if (dragging) h.renderer().domElement.dispatch('pointermove', { clientX: i, clientY: Math.sin(i) });
      h.frame(1000 / hz);
      assert.equal(h.frames.size, 1, `${hz} Hz has only one scheduled frame`);
    }
    assert.ok(h.paints.length >= 118 && h.paints.length <= 121,
      `${hz} Hz ${dragging ? 'dragging' : 'idle animation'} painted ${h.paints.length} times in two seconds`);
    h.renderer().domElement.dispatch('pointerup'); h.visibility(false);
    assert.equal(h.frames.size, 0);
  }
});

test('reduced motion becomes truly idle and a view click wakes exactly one settled repaint', () => {
  const h = sceneHarness({ reduced: true }); h.status(ready); h.frame(1000 / 60);
  assert.equal(h.paints.length, 1); assert.equal(h.frames.size, 0);
  const originalPosition = h.paints[0].lens.position.toArray();
  for (let i = 0; i < 20; i++) assert.equal(h.frame(), false);
  h.buttons[1].dispatch('click'); assert.equal(h.frames.size, 1);
  h.frame(1000 / 60);
  assert.equal(h.paints.length, 2); assert.equal(h.frames.size, 0);
  assert.notDeepEqual(h.paints.at(-1).lens.position.toArray(), originalPosition);
  assert.equal(h.buttons[1].attributes['aria-pressed'], 'true');
  h.status(ready); h.frame(1000 / 60);
  assert.equal(h.frames.size, 0, 'a late detail upload wakes a still frame, not a permanent loop');
  h.reduced(false); assert.equal(h.frames.size, 1); h.frame(1000 / 60);
  assert.equal(h.frames.size, 1);
  h.reduced(true); h.frame(1000 / 60); assert.equal(h.frames.size, 0);
});

test('the stationary structure caches its shadow through normal animation and refreshes it after context recovery', () => {
  const h = sceneHarness(); h.status(ready);
  assert.equal(h.renderer().shadowMap.autoUpdate, false);
  h.frame(1000 / 60); assert.equal(h.paints[0].shadowDirty, true);
  const cups = h.paints[0].station.getObjectByName('wind-speed-sensor');
  cups.traverse(part => { if (part.isMesh) assert.equal(part.castShadow, false); });
  for (let i = 0; i < 180; i++) h.frame(1000 / 60);
  assert.ok(h.paints.slice(1).every(paint => !paint.shadowDirty), 'moving snow and sensor cups do not rerender static shadows');
  h.buttons[1].dispatch('click'); h.frame(1000 / 60);
  assert.equal(h.paints.at(-1).shadowDirty, false, 'camera motion does not change the shadow casters');
  h.renderer().domElement.dispatch('webglcontextlost', { preventDefault() {} });
  h.renderer().domElement.dispatch('webglcontextrestored'); h.frame(1000 / 60);
  assert.equal(h.paints.at(-1).shadowDirty, true);
  h.frame(1000 / 60); assert.equal(h.paints.at(-1).shadowDirty, false);
});

test('first-paint and restored-context render failures show fallback, publish unavailable and leave no scheduled work', () => {
  for (const afterRestore of [false, true]) {
    const h = sceneHarness({ paintError: !afterRestore }); h.status(ready);
    if (afterRestore) {
      h.frame(); assert.equal(h.messages.at(-1).state, 'ready');
      h.renderer().domElement.dispatch('webglcontextlost', { preventDefault() {} });
      h.failPaint(true); h.renderer().domElement.dispatch('webglcontextrestored');
    }
    assert.doesNotThrow(() => h.frame());
    assert.equal(h.elements.sceneFallback.hidden, false);
    assert.equal(h.elements.polarScene.dataset.readyState, 'unavailable');
    assert.equal(h.elements.polarScene.dataset.runtimeActive, 'false');
    assert.equal(h.messages.at(-1).state, 'unavailable');
    assert.equal(h.frames.size, 0); assert.ok(h.buttons.every(button => button.disabled));
    h.status(ready); h.visibility(true); h.hidden(false);
    assert.equal(h.frames.size, 0, 'an ordinary UI event cannot revive the failed renderer');
    h.failPaint(false); h.renderer().domElement.dispatch('webglcontextrestored');
    assert.equal(h.frames.size, 1); h.frame();
    assert.equal(h.messages.at(-1).state, 'ready');
    assert.equal(h.elements.sceneFallback.hidden, true);
    assert.ok(h.buttons.every(button => !button.disabled));
  }
});

function environmentHarness({ reflectionError = false, timer } = {}) {
  const requests = [], statuses = [], scene = new T.Scene();
  const mockT = { ...T,
    TextureLoader: class { load(url, success, _progress, error) { requests.push({ url, success, error }); } },
    PMREMGenerator: class { fromEquirectangular() { if (reflectionError) throw new Error('Reflection not supported');
      return { texture: new T.Texture(), dispose() {} }; } dispose() {} }
  };
  const crust = new T.MeshStandardMaterial();
  const result = environment.create(mockT, { capabilities: { getMaxAnisotropy: () => 8 } }, scene,
    status => statuses.push(status), crust, timer);
  return { requests, statuses, result, scene, crust };
}

test('all delivery textures automatically recover to their original PNG without premature error', () => {
  const h = environmentHarness();
  assert.equal(h.requests.length, 1, 'only the original panorama is in the critical download lane');
  h.result.afterFrame();
  assert.equal(h.requests.length, 3);
  const preferred = h.requests.slice();
  assert.ok(preferred.every(request => request.url.endsWith('.webp')));
  for (const request of preferred) request.error();
  assert.equal(h.statuses.length, 0, 'WebP fallback is still loading, not a terminal failure');
  const fallbacks = h.requests.slice(3);
  assert.equal(fallbacks.length, 3);
  for (let i = 0; i < fallbacks.length; i++) {
    assert.equal(fallbacks[i].url, preferred[i].url.replace(/webp$/, 'png'));
    fallbacks[i].success(new T.Texture());
  }
  assert.deepEqual(h.statuses.at(-1), ready);
  assert.equal(h.scene.environment,null,'reflection filtering does not run in an image callback');
  h.result.afterFrame();
  assert.ok(h.scene.environment);
  assert.ok(h.crust.map && h.crust.bumpMap);
  const ground = h.result.group.getObjectByName('displaced-sastrugi-foreground');
  assert.ok(ground.material.map && ground.material.bumpMap);
  assert.equal(ground.material.depthWrite, true); assert.equal(ground.material.transparent, false);
  const reflection = h.scene.environment; h.result.restore();
  assert.notEqual(h.scene.environment, reflection, 'context restoration rebuilds the original reflection map');
});

test('terminal fallback failure is reported rather than falsely completing quality', () => {
  const h = environmentHarness(); h.requests[0].error();
  h.requests[1].error();
  assert.equal(h.statuses.at(-1).panorama, 'error');
  assert.equal(h.statuses.at(-1).snow, 'loading');
  h.result.afterFrame();assert.equal(h.requests.length,4,'failed panoramas do not prevent independent details from loading');
});

test('legacy deferred-detail callers remain idempotent while the scene uses explicit preparation',()=>{
  const h=environmentHarness();h.requests[0].success(new T.Texture());
  assert.equal(h.requests.length,1);assert.equal(h.scene.environment,null);
  h.result.afterFrame();assert.equal(h.requests.length,3);assert.equal(h.scene.environment,null);
  h.result.afterFrame();assert.ok(h.scene.environment);const reflection=h.scene.environment;
  for(let i=0;i<8;i++)h.result.afterFrame();assert.equal(h.requests.length,3);assert.equal(h.scene.environment,reflection);
});

test('explicit preparation loads all materials in parallel and settles reflection before presentation', () => {
  const h = environmentHarness(); h.result.prepare(); h.result.prepare();
  assert.equal(h.requests.length, 3, 'both detail downloads start without waiting for a render or panorama download');
  assert.equal(h.result.presentationReady(), false);
  for (const request of h.requests) request.success(new T.Texture());
  assert.equal(h.result.presentationReady(), false, 'hot image cache does not imply prepared reflection');
  assert.equal(h.scene.environment, null);
  h.result.afterFrame(); assert.equal(h.result.presentationReady(), true);
  assert.equal(h.result.degraded(), false); assert.ok(h.scene.environment);
  assert.equal(h.result.pendingWork(), false);
  for (let i = 0; i < 5; i++) h.result.prepare();
  assert.equal(h.requests.length, 3, 'scene resumes never duplicate material requests');
});

test('unsupported reflection remains a usable explicit degraded scene instead of blocking presentation', () => {
  const h = environmentHarness({ reflectionError: true }); h.result.prepare();
  for (const request of h.requests) request.success(new T.Texture());
  assert.doesNotThrow(() => h.result.afterFrame());
  assert.equal(h.result.presentationReady(), true);
  assert.equal(h.result.degraded(), true); assert.equal(h.scene.environment, null);
  assert.equal(h.result.pendingWork(), false);
});

test('context restoration settles already pending reflection without rebuilding it twice', () => {
  const h = environmentHarness(); h.result.prepare();
  for (const request of h.requests) request.success(new T.Texture());
  h.result.restore(); const restored = h.scene.environment;
  assert.equal(h.result.presentationReady(), true); assert.equal(h.result.pendingWork(), false);
  h.result.afterFrame(); assert.equal(h.scene.environment, restored);
});

test('parallel material deadlines bound the coherent reveal and accept late full-quality recovery', () => {
  let sequence = 0;
  const deadlines = new Map();
  const timer = { setTimeout(callback, delay) { const id = ++sequence; deadlines.set(id, { callback, delay }); return id; },
    clearTimeout(id) { deadlines.delete(id); } };
  const h = environmentHarness({ timer }); h.result.prepare();
  assert.deepEqual([...deadlines.values()].map(entry => entry.delay).sort((a, b) => a - b), [6000, 10000, 10000]);
  for (const [id, entry] of [...deadlines]) if (entry.delay === 6000) { deadlines.delete(id); entry.callback(); }
  assert.equal(h.result.presentationReady(), false, 'panorama timeout does not expose still-loading materials');
  assert.equal(h.result.pendingWork(), false, 'pending transport does not require an animation loop');
  for (const [id, entry] of [...deadlines]) { deadlines.delete(id); entry.callback(); }
  assert.equal(h.result.presentationReady(), true); assert.equal(h.result.degraded(), true);
  assert.equal(h.requests.length, 3, 'slow transfers do not trigger competing original-format retries');
  for (const request of h.requests) request.success(new T.Texture());
  assert.equal(h.result.presentationReady(), false, 'late panorama still needs its reflection before the recovery render');
  h.result.afterFrame();
  assert.equal(h.result.presentationReady(), true); assert.equal(h.result.degraded(), false);
  assert.deepEqual(h.statuses.at(-1), ready); assert.equal(deadlines.size, 0);
});

test('lossless WebP delivery retains exact original dimensions and saves at least 25 percent per texture', () => {
  for (const name of ['antarctic-glacier-storm-v4', 'wind-carved-snow-v1', 'compacted-snow-crust-v2']) {
    const source = fs.readFileSync(path.join(__dirname, '../assets/polar', name + '.png'));
    const packed = fs.readFileSync(path.join(__dirname, '../assets/polar', name + '.webp'));
    assert.equal(packed.toString('ascii', 0, 4), 'RIFF');
    assert.equal(packed.toString('ascii', 8, 12), 'WEBP');
    assert.equal(packed.toString('ascii', 12, 16), 'VP8L', 'VP8L is the lossless WebP bitstream');
    assert.equal(packed[20], 0x2f);
    const dimensions = packed.readUInt32LE(21);
    assert.equal((dimensions & 0x3fff) + 1, source.readUInt32BE(16));
    assert.equal(((dimensions >>> 14) & 0x3fff) + 1, source.readUInt32BE(20));
    assert.ok(packed.length < source.length * .75);
  }
});

test('critical scene runtime and original panorama are preloaded with matching local request URLs', () => {
  const main = read('expedition.html');
  assert.match(main, /<script id="scenePreload">/);
  assert.ok(!main.includes('src="./js/expedition-preload.js'),'the critical preload lane adds no parser-blocking network roundtrip');
  for (const file of ['field-frame.html', 'observatory.html']) {
    assert.match(read(file), /rel="preload" as="image" type="image\/webp" fetchpriority="high" href="\.\/assets\/polar\/antarctic-glacier-storm-v4\.webp"/);
  }
  for (const file of ['field-frame.html', 'observatory.html']) {
    const scripts = expandedScriptSources(file);
    for (const module of ['polar-environment', 'polar-scene', 'render-budget', 'polar-batch']) {
      assert.ok(scripts.includes(`./js/${module}.js`), `${file} includes ${module}`);
    }
  }
  assertCurrentBundle('field-frame.html', 'field');
});

function preloadHarness(view='dashboard',desktop=true,mobile=false){
  const links=[],window={matchMedia:()=>({matches:desktop})},location={search:'?view='+view+(mobile?'&client=mobile':'')};
  const preload=read('expedition.html').match(/<script id="scenePreload">([\s\S]*?)<\/script>/)[1];
  vm.runInNewContext(preload,{window,location,URLSearchParams,document:{createElement:()=>({}),head:{appendChild:link=>links.push(link)}}});
  return {links,window,location};
}

test('head preloads the active scene and blocking style with field details below UI priority',()=>{
  for(const view of ['dashboard','hardware','network','globe','location','sensors','telemetry','analysis','download'])for(const desktop of [true,false])for(const mobile of [true,false]){
    const {links,window}=preloadHarness(view,desktop,mobile);
    assert.equal(typeof window.ExpeditionPreload,'function','non-3D entries retain the later navigation preload entry point');
    const device=view==='dashboard',earth=['network','globe'].includes(view);
    assert.equal(links.length,(desktop||mobile)&&(device||earth)?(device?6:4):0);
    if(links.length){
      assert.equal(links[0].href,'./assets/three.min.js');assert.equal(links[0].as,'script');
      assert.equal(links[1].href,bundleFor(device?'field':'earth').src);assert.equal(links[1].as,'script');
      assert.ok(links.slice(0,4).every(link=>link.fetchPriority==='high'));
      assert.equal(links[2].as,'style');
      const frameStyle=read(device?'field-frame.html':'globe-frame.html').match(/<link rel="stylesheet" href="([^"]+)"/)[1];
      assert.equal(links[2].href,frameStyle,'preload and actual frame style share the exact cache key');
      assert.equal(links[3].as,'image');assert.equal(links[3].type,'image/webp');
      assert.equal(links[3].href,device?'./assets/polar/antarctic-glacier-storm-v4.webp':'./assets/geo/earth-surface-v1.webp');
      if(device){
        assert.deepEqual(links.slice(4).map(link=>link.href),['./assets/polar/compacted-snow-crust-v2.webp','./assets/polar/wind-carved-snow-v1.webp']);
        assert.ok(links.slice(4).every(link=>link.as==='image'&&link.type==='image/webp'&&link.fetchPriority==='low'));
      }
    }
  }
});

test('non-3D entries preload no scene until navigation and repeated routes share assets once',()=>{
  for(const entry of ['hardware','location','sensors','telemetry','analysis','download'])for(const first of ['dashboard','network','globe']){
    const h=preloadHarness(entry);
    assert.equal(h.links.length,0);
    h.window.ExpeditionPreload(first);
    const firstLinks=h.links.slice();
    assert.equal(firstLinks.length,first==='dashboard'?6:4);
    for(const lang of ['zh','en'])for(const station of ['a01','a02','a03']){
      h.location.search='?view='+first+'&station='+station+'&lang='+lang;
      h.window.ExpeditionPreload(first);h.window.ExpeditionPreload(first);
    }
    assert.deepEqual(h.links,firstLinks,'language/readout/refresh changes reuse exactly the original preload elements');
    for(const route of ['network','dashboard','globe','hardware','sensors','network','dashboard'])h.window.ExpeditionPreload(route);
    assert.equal(h.links.length,9,'field and earth each get their assets; Three is shared');
    assert.equal(new Set(h.links.map(link=>link.href)).size,9);
    assert.equal(h.links.filter(link=>link.href==='./assets/three.min.js').length,1);
    assert.equal(h.links.filter(link=>link.href===bundleFor('field').src).length,1);
    assert.equal(h.links.filter(link=>link.href===bundleFor('earth').src).length,1);
    assert.equal(h.links.filter(link=>link.as==='style').length,2);
  }
});

test('preloading remains available when an initially narrow entry becomes desktop or client mode',()=>{
  const h=preloadHarness('sensors',false);
  h.window.ExpeditionPreload('network');assert.equal(h.links.length,0);
  h.window.matchMedia=()=>({matches:true});
  h.window.ExpeditionPreload('network');assert.equal(h.links.length,4);
  const mobile=preloadHarness('hardware',false);
  mobile.window.ExpeditionClient={mobile:true};
  mobile.window.ExpeditionPreload('dashboard');assert.equal(mobile.links.length,6);
});

test('render preloads its scene before frame construction and hardware photos stay cold',()=>{
  const source=read('js/expedition-app.js');
  const start=source.indexOf('  function render() {'),end=source.indexOf('    const preserveCharts=',start);
  assert.ok(start>=0&&end>start);
  const firstStatement=source.slice(start+'  function render() {'.length,end);
  assert.match(firstStatement,/window\.ExpeditionPreload\?\./);
  assert.ok(end<source.indexOf("const draft=document.createElement('div')",start));
  for(const [active,deviceView,expected] of [['dashboard','photos','dashboard'],['network','photos','network'],['globe','photos','globe'],['hardware','photos','hardware'],['hardware','concept','dashboard'],['sensors','photos','sensors']]){
    const h=preloadHarness('sensors');
    vm.runInNewContext(firstStatement,{window:h.window,active,deviceView});
    assert.deepEqual(h.links.map(link=>link.href),preloadHarness(expected).links.map(link=>link.href));
  }
  assert.doesNotThrow(()=>vm.runInNewContext(firstStatement,{window:{},active:'dashboard',deviceView:'photos'}),'an unavailable optional preload entry point never breaks routing');
});

test('the app runtime has high request priority because it discovers scene frames',()=>{
  const main=read('expedition.html'),appTag=main.match(/<!-- runtime:app -->\s*(<script[^>]+>)/)[1];
  assert.match(appTag,/\sfetchpriority="high"/);assert.match(appTag,/\sdefer(?:\s|>)/);
});
