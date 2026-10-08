const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { assertCurrentBundle } = require('./helpers/runtime.cjs');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const source = read('js/field-frame.js');

function sceneFixture(language, initiallyPaused, withLegacyMotion = true) {
  const attributes = { 'aria-pressed': String(initiallyPaused) };
  const icons = [{ className: 'motion-pause' }, { className: 'motion-play' }];
  const motion = {
    childNodes: icons,
    getAttribute: key => attributes[key],
    setAttribute(key, value) { attributes[key] = value; }
  };
  Object.defineProperty(motion, 'textContent', { set() { assert.fail('state updates must preserve both SVG nodes'); } });
  Object.defineProperty(motion, 'innerHTML', { set() { assert.fail('state updates must never rebuild icon markup'); } });
  const views = ['全景', '近景', '俯瞰'].map(textContent => ({ textContent }));
  const listeners = new Map(), dispatched = [], root = { dataset: {}, setAttribute(name,value){this[name]=value;} };
  const controls={setAttribute(name,value){this[name]=value;}}, fallback={}, environment={dataset:{},setAttribute(name,value){this[name]=value;}};
  vm.runInNewContext(source, {
    URLSearchParams,
    location: { search: `?station=a02&lang=${language}` },
    CustomEvent: function (type, options) { this.type = type; this.detail = options.detail; },
    document: {
      documentElement: root,
      getElementById(id) { if(id==='sceneFallback')return fallback;if(id==='environmentStatus')return environment;assert.equal(id, 'motionToggle'); return withLegacyMotion ? motion : null; },
      querySelector(selector){assert.equal(selector,'.view-controls');return controls;},
      querySelectorAll(selector) { assert.equal(selector, '[data-view]'); return views; }
    },
    window: {
      addEventListener(type, callback) { assert.equal(type, 'polar:motion'); assert.ok(!listeners.has(type)); listeners.set(type, callback); },
      dispatchEvent(event) { dispatched.push(event); }
    }
  });
  return { attributes, icons, motion, views, root, controls, fallback, environment, dispatched, update: listeners.get('polar:motion') };
}

for (const language of ['zh', 'en']) {
  test(`field ${language} motion labels follow initial and changed states without replacing SVG children`, () => {
    for (const initiallyPaused of [false, true]) {
      const f = sceneFixture(language, initiallyPaused);
      const labels = language === 'en' ? ['Pause scene', 'Resume scene'] : ['暂停场景动画', '继续场景动画'];
      function check(paused) {
        assert.equal(f.attributes['aria-label'], labels[Number(paused)]);
        assert.equal(f.attributes.title, labels[Number(paused)]);
        assert.equal(f.attributes['aria-pressed'], String(paused), 'controller must not take over scene state');
        assert.equal(f.motion.childNodes, f.icons);
        assert.equal(f.motion.childNodes.length, 2);
      }
      check(initiallyPaused);
      for (const paused of [!initiallyPaused, initiallyPaused]) {
        f.attributes['aria-pressed'] = String(paused); f.update(); check(paused);
      }
      assert.equal(f.root.dataset.language, language);
      assert.deepEqual(f.views.map(view => view.textContent), language === 'en' ? ['Wide', 'Detail', 'Above'] : ['全景', '近景', '俯瞰']);
      assert.equal(f.dispatched.length, 1);
      assert.equal(f.dispatched[0].type, 'polar:station');
      assert.equal(f.dispatched[0].detail, 'a02');
    }
  });
}

test('field language and station initialize without the removed motion button', () => {
  for (const language of ['zh', 'en']) {
    const f = sceneFixture(language, false, false);
    assert.equal(f.root.dataset.language, language);
    assert.equal(f.controls['aria-label'],language==='en'?'Choose instrument view':'选择装置视角');
    assert.equal(f.environment.role,'status');
    assert.equal(f.root.lang,language==='en'?'en':'zh-CN');
    assert.equal(f.dispatched[0].detail, 'a02');
    assert.equal(f.update, undefined, 'no obsolete listener when there is no motion button');
    assert.deepEqual(f.views.map(view => view.textContent), language === 'en' ? ['Wide', 'Detail', 'Above'] : ['全景', '近景', '俯瞰']);
  }
});

test('field markup removes pause and play while keeping accessible view controls', () => {
  const html = read('field-frame.html'), css = read('css/field-finish.css');
  assert.doesNotMatch(html, /motionToggle|motion-pause|motion-play/);
  for (const view of ['wide', 'close', 'top']) assert.ok(html.includes(`data-view="${view}"`));
  assert.match(css, /min-height: 44px; min-width: 44px/);
  assert.match(css, /button:focus-visible/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.doesNotMatch(source, /setInterval|setTimeout|requestAnimationFrame|MutationObserver|innerHTML/);
  assert.ok(html.includes('field-finish.css?v=20261008t'));
  assert.ok(assertCurrentBundle('field-frame.html', 'field').sources.some(file => file.file === 'js/field-frame.js'));
});
