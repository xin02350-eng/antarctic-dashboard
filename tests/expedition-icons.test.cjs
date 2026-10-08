const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { glyphs, paths, selectors, create, mount } = require('../js/expedition-icons.js');

function fixture() {
  function node(type, name, data, namespaceURI) {
    return {
      nodeType: type, nodeName: name, data, namespaceURI, childNodes: [], attrs: {}, dataset: {},
      appendChild(child) { child.parentNode = this; this.childNodes.push(child); return child; },
      setAttribute(name, value) { this.attrs[name] = value; },
      replaceChild(replacement, original) {
        const index = this.childNodes.indexOf(original), nodes = replacement.nodeType === 11 ? replacement.childNodes : [replacement];
        assert.ok(index >= 0); nodes.forEach(child => { child.parentNode = this; });
        this.childNodes.splice(index, 1, ...nodes); original.parentNode = null;
      }
    };
  }
  const candidates = [], routeCopy = node(1, 'SMALL');
  routeCopy.appendChild(node(3, '#text', '南京 → 东北（哈尔滨）→ 南极'));
  const doc = {
    querySelectorAll(selector) { assert.equal(selector, selectors); return candidates; },
    createElementNS: (namespace, name) => node(1, name.toUpperCase(), undefined, namespace),
    createDocumentFragment: () => node(11, '#document-fragment'), createTextNode: data => node(3, '#text', data)
  };
  function element(name, text, attrs = {}) {
    const item = node(1, name.toUpperCase()); item.attrs = { ...attrs };
    if (text !== undefined) item.appendChild(doc.createTextNode(text));
    return item;
  }
  function control(name, text, attrs) { const item = element(name, text, attrs); candidates.push(item); return item; }
  function icons(item) { return item.childNodes.flatMap(child => child.nodeName === 'SVG' ? [child] : icons(child)); }
  function text(item) { return item.nodeType === 3 ? item.data : item.childNodes.map(text).join(''); }
  return { doc, candidates, routeCopy, element, control, icons, text, api: create(doc) };
}

test('navigation and download icons have finite, compact 24-grid geometry', () => {
  assert.deepEqual(Object.keys(glyphs), ['↗', '→', '←', '↓', '↻', '⇩']);
  for (const direction of Object.values(glyphs)) {
    const d = paths[direction]; assert.match(d, /^M/); assert.ok(!/NaN|Infinity|undefined/.test(d));
    const coordinates = d.match(/\d+(?:\.\d+)?/g).map(Number);
    assert.ok(coordinates.every(value => value >= 0 && value <= 24));
  }
  assert.match(paths.right, /M5\.5 12H18\.5/); assert.match(paths.left, /M18\.5 12H5\.5/);
  assert.match(paths.download, /M5 16V19\.5H19V16/, 'download has a receiving tray, not a navigation arrow');
});

test('leading, trailing and isolated glyphs become noninteractive accessibility-hidden SVGs', () => {
  const f = fixture();
  const next = f.control('a', '开启探索 ↗'), previous = f.control('button', '← 上一页'), refresh = f.control('button', '↻');
  const down = f.control('small', '↓ 最新优先'), right = f.control('a', '全球视野 →');
  assert.equal(f.api.mount(), 5);
  assert.equal(f.text(next), '开启探索 '); assert.equal(f.text(previous), ' 上一页');
  assert.equal(f.text(refresh), ''); assert.equal(f.text(down), ' 最新优先'); assert.equal(f.text(right), '全球视野 ');
  for (const item of f.candidates) {
    const svg = f.icons(item)[0];
    assert.equal(svg.attrs.viewBox, '0 0 24 24'); assert.equal(svg.attrs.width, '24'); assert.equal(svg.attrs.height, '24');
    assert.equal(svg.attrs['aria-hidden'], 'true'); assert.equal(svg.attrs.focusable, 'false'); assert.equal(svg.attrs['pointer-events'], 'none');
    assert.equal(svg.attrs.fill, 'none'); assert.equal(svg.attrs.stroke, 'currentColor'); assert.equal(svg.attrs['stroke-width'], '1.5');
    assert.equal(svg.childNodes[0].attrs['vector-effect'], 'non-scaling-stroke');
  }
});

test('mount preserves labels, hrefs, actions, IDs, ARIA and disabled button state', () => {
  const f = fixture();
  const button = f.control('button', '上一页 ←', { id: 'archivePrevious', 'data-page': '0', 'aria-label': '上一页', disabled: '' });
  button.dataset.page = '0'; button.disabled = true;
  const link = f.control('a', '全部记录 ↗', { href: './expedition.html?view=telemetry', 'data-route': 'telemetry' });
  const beforeButton = { ...button.attrs }, beforeLink = { ...link.attrs };
  f.api.mount();
  assert.deepEqual(button.attrs, beforeButton); assert.deepEqual(link.attrs, beforeLink);
  assert.equal(button.dataset.page, '0'); assert.equal(button.disabled, true);
  assert.equal(f.text(button), '上一页 '); assert.equal(f.text(link), '全部记录 ');
});

test('nested arrow spans are replaced once, without duplicating SVGs on subsequent mounts', () => {
  const f = fixture(), link = f.control('a', '监测装置');
  const span = f.element('span', '↗', { class: 'nav-arrow' }); link.appendChild(span);
  const nested = f.element('span', '下载 ↓ 与备用 ↗'); link.appendChild(nested);
  assert.equal(f.api.mount(), 3); assert.equal(f.api.mount(), 0);
  assert.equal(f.icons(link).length, 3); assert.equal(f.text(link), '监测装置下载  与备用 ');
  assert.equal(span.attrs.class, 'nav-arrow');
});

test('illustrative route copy and refresh loading ellipsis are not changed', () => {
  const f = fixture(), loading = f.control('button', '…'); f.api.mount();
  assert.equal(f.text(f.routeCopy), '南京 → 东北（哈尔滨）→ 南极'); assert.equal(f.text(loading), '…');
  assert.equal(f.icons(f.routeCopy).length, 0); assert.equal(f.icons(loading).length, 0);
  assert.equal(selectors, 'a,button,.table-scroll thead small');
});

test('download mark is mounted once without altering the destination or accessible name', () => {
  const f = fixture();
  const link = f.control('a', '下载 Android 客户端 ⇩', { href: './apk/DMS-antarctic.apk', 'aria-label': '下载 Android 客户端' });
  assert.equal(f.api.mount(), 1); assert.equal(f.api.mount(), 0);
  assert.equal(f.icons(link)[0].attrs.class, 'icon icon-download');
  assert.equal(f.text(link), '下载 Android 客户端 ');
  assert.equal(link.attrs.href, './apk/DMS-antarctic.apk');
  assert.equal(link.attrs['aria-label'], '下载 Android 客户端');
});

test('desktop keeps the DMS wordmark and uses contextual icons without the former skewed emblem', () => {
  const app = fs.readFileSync(path.join(__dirname, '../js/expedition-app.js'), 'utf8');
  const css = fs.readFileSync(path.join(__dirname, '../css/expedition-studio.css'), 'utf8');
  assert.ok(app.includes('<b>DMS<span>POLAR SYSTEMS</span></b>'));
  assert.ok(!app.includes('brand-glyph') && !css.includes('skew('));
  const original = /<span class="photo-open">[^<]*↗<\/span>/g;
  const selection = /<span class="photo-select" aria-hidden="true">→<\/span>/g;
  assert.equal((app.match(original) || []).length, 1, 'opening the original photograph has an outward arrow');
  assert.equal((app.match(selection) || []).length, 1, 'local photograph selection keeps the horizontal arrow');
  assert.ok(!app.replace(original, '').replace(selection, '').includes('↗'), 'all local navigation outside photograph controls uses the horizontal arrow');
  assert.match(app, /class="nav-arrow" aria-hidden="true">→<\/span>/);
  assert.ok(app.includes("Android 2.0.1 preview')} ⇩</a>"));
  assert.doesNotMatch(app, /header-menu|menu-glyph/);
  assert.doesNotMatch(css, /header-menu|menu-glyph|nav-secondary/);
  assert.match(css, /\.language \{[^}]*min-width: 44px; min-height: 44px/);
  assert.match(css, /\.station-select select \{[^}]*min-height: 44px/);
});

test('original-photograph outward icon preserves the original URL and safe new-window semantics', () => {
  const f = fixture();
  const original = f.control('a', undefined, {
    class: 'photo-original', href: './assets/hardware/01-2.jpg', target: '_blank', rel: 'noopener', 'aria-label': '查看原图 · 实物全貌'
  });
  original.appendChild(f.element('img', undefined, { src: './assets/hardware/01-2.jpg', alt: 'DMS-A01 硬件实拍 1' }));
  original.appendChild(f.element('span', '查看原图 ↗', { class: 'photo-open' }));
  const before = { ...original.attrs };
  assert.equal(f.api.mount(), 1);
  assert.equal(f.api.mount(), 0);
  assert.deepEqual(original.attrs, before);
  assert.equal(f.text(original), '查看原图 ');
  assert.equal(f.icons(original)[0].attrs.class, 'icon icon-northeast');
  assert.equal(original.childNodes[0].attrs.src, before.href);
});

test('SVG subtrees and input values are not traversed; duplicate candidate ancestry stays safe', () => {
  const f = fixture(), button = f.control('button', '刷新 ↻'), nested = f.element('span', ' → ');
  button.appendChild(nested); f.candidates.push(nested);
  const input = f.element('input', '←', { value: '密码 →' }); button.appendChild(input);
  assert.equal(f.api.mount(), 2); assert.equal(f.icons(button).length, 2);
  assert.equal(f.text(input), '←'); assert.equal(input.attrs.value, '密码 →');
});

test('browser initialization performs no DOM work before the explicit mount lifecycle', () => {
  const source = fs.readFileSync(path.join(__dirname, '../js/expedition-icons.js'), 'utf8');
  const browser = { document: undefined };
  vm.runInNewContext(source, { window: browser });
  assert.equal(typeof browser.ExpeditionIcons.mount, 'function');
  const f = fixture(); f.control('a', '查看 ↗'); assert.equal(mount(f.doc), 1);
});

test('supported older browsers mount icons without Object.hasOwn or inherited-key substitutions', () => {
  const source = fs.readFileSync(path.join(__dirname, '../js/expedition-icons.js'), 'utf8');
  const f = fixture(), browser = { document: f.doc };
  const link = f.control('a', 'toString→constructor'), download = f.control('a', '下载 ⇩');
  const context = vm.createContext({ window: browser });
  vm.runInContext('Object.hasOwn = undefined;', context);
  vm.runInContext(source, context);
  assert.equal(browser.ExpeditionIcons.mount(), 2);
  assert.equal(f.text(link), 'toStringconstructor', 'prototype names remain ordinary copy');
  assert.equal(f.icons(link)[0].attrs.class, 'icon icon-right');
  assert.equal(f.icons(download)[0].attrs.class, 'icon icon-download');
  assert.equal(browser.ExpeditionIcons.mount(), 0, 'repeat renders remain idempotent');
});
