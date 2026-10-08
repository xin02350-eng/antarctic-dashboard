const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
const css = read('css/expedition-studio.css');
const desktop = 'html:not([data-client="mobile"])';

// Structural contracts complement, rather than replace, real-browser layout
// checks. Preserve both viewport-unit declarations so old-engine fallbacks
// cannot silently disappear while the modern declaration still passes.
function splitTop(value, separator = ',') {
  const parts = []; let depth = 0, start = 0;
  for (let i = 0; i < value.length; i++) {
    if ('(['.includes(value[i])) depth++;
    if (')]'.includes(value[i])) depth--;
    if (value[i] === separator && !depth) { parts.push(value.slice(start, i).trim()); start = i + 1; }
  }
  parts.push(value.slice(start).trim()); return parts;
}
function readRules(source, conditions = []) {
  source = source.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = []; let cursor = 0;
  while (cursor < source.length) {
    const open = source.indexOf('{', cursor);
    if (open < 0) { assert.equal(source.slice(cursor).trim(), ''); break; }
    const header = source.slice(cursor, open).trim(); let depth = 1, end = open + 1;
    while (end < source.length && depth) { if (source[end] === '{') depth++; if (source[end] === '}') depth--; end++; }
    assert.equal(depth, 0, 'all CSS declaration blocks close');
    const body = source.slice(open + 1, end - 1);
    if (header.startsWith('@')) rules.push(...readRules(body, [...conditions, header]));
    else {
      const entries = splitTop(body, ';').filter(Boolean).map(part => {
        const colon = part.indexOf(':'); assert.ok(colon > 0, part);
        return [part.slice(0, colon).trim(), part.slice(colon + 1).trim()];
      });
      for (const selector of splitTop(header)) rules.push({ selector, entries, conditions, declarations: Object.fromEntries(entries) });
    }
    cursor = end;
  }
  return rules;
}
const rules = readRules(css);
const shortRules = rules.filter(rule => rule.conditions.some(condition => /max-height:\s*600px/.test(condition)));
function rule(selector, collection = shortRules) {
  const match = collection.find(candidate => candidate.selector === selector);
  assert.ok(match, 'expected responsive rule: ' + selector); return match;
}
function short(selector) { return rule(desktop + ' ' + selector).declarations; }
function clampHeight(expression, viewportHeight) {
  const match = expression.match(/^clamp\(([\d.]+)px,calc\(100(?:s?vh) - ([\d.]+)px\),([\d.]+)px\)$/);
  assert.ok(match, 'bounded viewport height with an explicit pixel fallback: ' + expression);
  return Math.max(+match[1], Math.min(viewportHeight - +match[2], +match[3]));
}

test('responsive refinement adds no external request and uses the same compressed local field plate', () => {
  const html = read('expedition.html');
  const styles = [css, read('css/expedition-actions.css'), read('css/expedition-mobile.css')];
  for (const source of styles) {
    assert.doesNotMatch(source, /@import\b/i);
    for (const match of source.matchAll(/url\(\s*['"]?([^)'"\s]+)/gi)) {
      assert.ok(!/^(?:https?:)?\/\//i.test(match[1]), 'CSS assets stay local: ' + match[1]);
    }
  }
  for (const match of html.matchAll(/<(?:script|link)\b[^>]*\b(?:src|href)="([^"]+)"/gi)) {
    assert.ok(match[1].startsWith('./') || match[1] === 'data:,', 'entry assets stay local: ' + match[1]);
  }
  const stage = rule('.mission-stage', rules).declarations;
  assert.match(stage.background, /antarctic-glacier-storm-v4\.webp/);
  assert.doesNotMatch(JSON.stringify(stage), /\.png\b|image-set\(/);
  assert.doesNotMatch(css, /antarctic-glacier-storm-v4\.png/);
  assert.ok(fs.existsSync(path.join(__dirname, '../assets/polar/antarctic-glacier-storm-v4.webp')));
});

test('short desktop rules are explicitly isolated from the landscape phone client', () => {
  assert.ok(shortRules.length >= 20, 'inspect the complete short-window treatment');
  for (const item of shortRules) {
    assert.ok(item.selector.startsWith(desktop + ' '), item.selector + ' must not affect mobile clients');
    assert.ok(item.conditions.some(condition => /min-width:\s*769px/.test(condition)), 'narrow desktop uses its own reflow');
    assert.equal(item.declarations.zoom, undefined);
    assert.doesNotMatch(item.declarations.transform || '', /scale\(|rotate\(/, 'real reflow, not page scaling');
    assert.notEqual(item.declarations.overflow, 'hidden', 'compatibility must not hide content that fails to fit');
  }
});

test('short desktop header and scene budgets retain vh before the stable-viewport enhancement', () => {
  assert.equal(short('.navigation-rail')['min-height'], '64px');
  assert.equal(short('#content')['padding-top'], '64px');
  assert.equal(short('body[data-view=dashboard] #content')['padding-top'], '0', 'immersive home remains full bleed');
  for (const selector of ['.orbital-atlas', 'body[data-view=globe] .globe-stage']) {
    const heights = rule(desktop + ' ' + selector).entries.filter(([key]) => key === 'height').map(([, value]) => value);
    assert.equal(heights.length, 2);
    assert.match(heights[0], /100vh/); assert.match(heights[1], /100svh/);
    for (const height of [480, 540, 600]) {
      assert.equal(clampHeight(heights[0], height), clampHeight(heights[1], height));
      const occupiedTop = selector === '.orbital-atlas' ? 124 : 76;
      assert.ok(occupiedTop + clampHeight(heights[0], height) <= height - 12,
        `${selector} at ${height}px: scene controls retain a lower viewport margin`);
    }
  }
});

test('short-window scene actions use available flex space instead of a fixed vertical gap', () => {
  const copy = short(':is(.orbital-copy,.globe-copy)');
  assert.equal(copy.display, 'flex'); assert.equal(copy['flex-direction'], 'column');
  assert.equal(copy.top, '1.25rem'); assert.equal(copy.bottom, '2.75rem');
  assert.equal(short('.orbital-actions')['margin-top'], 'auto');
  assert.equal(short('.orbital-actions')['padding-top'], '1rem');
  assert.equal(short('.globe-copy>a')['margin-top'], 'auto');
  assert.equal(short('.orbital-copy>small')['margin-top'], '.75rem');
});

test('hardware heading and view tabs occupy real grid cells without negative overlap', () => {
  const scope = desktop + ' body[data-view=hardware]';
  const grid = rule(scope + ' .route-page:not([hidden])', rules).declarations;
  assert.equal(grid.display, 'grid'); assert.equal(grid['grid-template-columns'], 'minmax(0,1fr) auto');
  const title = rule(scope + ' .route-page>.page-title', rules).declarations;
  const tabs = rule(scope + ' .route-page>.device-tabs', rules).declarations;
  assert.equal(title['grid-column'], '1'); assert.equal(tabs['grid-column'], '2');
  assert.equal(title['grid-row'], '1'); assert.equal(tabs['grid-row'], '1');
  assert.equal(tabs.margin, '0 var(--gutter) 0 0'); assert.notEqual(tabs.position, 'absolute');
  assert.equal(rule(desktop + ' .page-title', rules).declarations['flex-wrap'], 'wrap');
});

test('short desktop cards stay in flow and the data table keeps its independent scroll region', () => {
  const atlas = short('.atlas:not(.orbital-atlas)'), dossier = short('.atlas-dossier');
  assert.equal(atlas.display, 'grid'); assert.equal(atlas.height, 'auto');
  assert.equal(atlas['grid-template-columns'], 'minmax(0,1fr) 17rem');
  assert.equal(short('.atlas:not(.orbital-atlas) #atlasMap').position, 'relative');
  assert.equal(dossier.position, 'relative'); assert.equal(dossier.inset, 'auto'); assert.equal(dossier.width, 'auto');
  assert.equal(short('.table-scroll')['min-height'], '10rem');
  assert.equal(rule('.table-scroll', rules).declarations.overflow, 'auto');
  assert.equal(short('.hardware-showcase.photo-layout')['--gallery-height'], '21rem');
  assert.notEqual(short('.hardware-showcase.photo-layout').position, 'absolute');
});

test('aspect-ratio fallback retains actual photographs and a noncollapsed download illustration', () => {
  const fallback = rules.filter(item => item.conditions.includes('@supports not (aspect-ratio: 1)'));
  assert.equal(rule('.photo-original', fallback).declarations.width, '100%');
  assert.equal(rule('.photo-preview', fallback).declarations.width, '100%');
  assert.equal(rule('.download-art', fallback).declarations['min-height'], '16rem');
  for (const item of fallback) assert.notEqual(item.declarations.display, 'none');
  assert.equal(rule('.hardware-main-image', rules).declarations['object-fit'], 'contain');
});

test('keyboard focus remains visible without focus-visible support', () => {
  const fallback = rules.filter(item => item.conditions.includes('@supports not selector(:focus-visible)'));
  for (const selector of ['a:focus', 'button:focus', 'input:focus', 'select:focus', 'summary:focus', '[tabindex]:focus']) {
    const item = rule(selector, fallback).declarations;
    assert.equal(item.outline, '2px solid var(--accent)'); assert.equal(item['outline-offset'], '3px');
  }
});
