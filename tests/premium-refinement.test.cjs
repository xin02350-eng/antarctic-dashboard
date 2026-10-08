const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { assertCurrentBundle } = require('./helpers/runtime.cjs');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('route arrivals animate title content only and leave no permanent transformed hit area', () => {
  const css = read('css/expedition-studio.css');
  const arrivals = css.slice(css.indexOf('@media (prefers-reduced-motion: no-preference)'), css.indexOf('.site-footer {'));
  assert.ok(arrivals.includes('.route-page:not([hidden])>.page-title>div'));
  assert.doesNotMatch(arrivals, /:is\(\.page-title|>\.page-title\s*\{/);
  assert.doesNotMatch(arrivals, /\bboth\b|\bforwards\b|infinite|\.field-frame|\.earth-frame/);
  assert.equal((arrivals.match(/backwards/g) || []).length, 1);
  assert.doesNotMatch(arrivals, /:is\(\.hero-copy,\.orbital-copy,\.globe-copy\).*animation:/);
  assert.match(css, /prefers-reduced-motion: reduce/);
});

test('interactive surface reflection has keyboard and pointer parity', () => {
  const css = read('css/expedition-studio.css');
  assert.match(css, /\.surface-hover>\.specular-frame, \.surface-focus>\.specular-frame \{/);
  for (const selector of ['mini-signal', 'node-entry']) {
    assert.ok(css.includes(`.${selector}:hover, .${selector}:focus-visible`));
  }
});

test('every changed visual module has a matching fresh parent cache boundary', () => {
  const html = read('expedition.html');
  const versions = {
    'css/expedition-studio.css': '20261008r',
    'css/expedition-actions.css': '20261004g',
    'js/expedition-client.js': '20261004m',
    'css/expedition-mobile.css': '20261008t'
  };
  for (const [file, version] of Object.entries(versions)) {
    assert.ok(html.includes(file + '?v=' + version), file);
  }
  const appBundle = assertCurrentBundle('expedition.html', 'app');
  for (const module of ['actions', 'atmosphere', 'charts', 'specular', 'app']) {
    assert.ok(appBundle.sources.some(source => source.file === `js/expedition-${module}.js`));
  }
  assert.ok(read('field-frame.html').includes('css/field-finish.css?v=20261008t'));
  assertCurrentBundle('field-frame.html', 'field');
  const globe = read('globe-frame.html');
  assert.ok(globe.includes('css/earth-frame.css?v=20261008t'));
  assert.ok(assertCurrentBundle('globe-frame.html', 'earth').sources.some(source => source.file === 'js/expedition-globe.js'));
  assert.ok(read('observatory.html').includes('css/observatory.css?v=20261004b'));
  for (const frame of ['field', 'globe']) {
    const version = read('js/expedition-app.js').match(new RegExp(`${frame}-frame\\.html[^\x60]+&v=(\\d{8}[a-z]+)`));
    assert.ok(version && version[1] >= '20261008b', `${frame} parent URL invalidates the progressive-reveal frame release`);
  }
});
