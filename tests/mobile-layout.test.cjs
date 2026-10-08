const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const css = fs.readFileSync(path.join(__dirname, '../css/expedition-mobile.css'), 'utf8');
const root = 'html[data-client="mobile"]';

// A small structural reader, not a browser layout engine. Keeping conditions
// on each rule lets the tests exercise real fallback and viewport expressions.
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
    assert.equal(depth, 0, 'every declaration block is closed');
    const body = source.slice(open + 1, end - 1);
    if (header.startsWith('@')) rules.push(...readRules(body, [...conditions, header]));
    else {
      const declarations = {};
      for (const part of splitTop(body, ';').filter(Boolean)) {
        const colon = part.indexOf(':'); assert.ok(colon > 0, part);
        declarations[part.slice(0, colon).trim()] = part.slice(colon + 1).trim();
      }
      for (const selector of splitTop(header)) rules.push({ selector, declarations, conditions });
    }
    cursor = end;
  }
  return rules;
}
const rules = readRules(css);
function applicable(rule, viewport) {
  return rule.conditions.every(condition => {
    if (condition.startsWith('@supports')) return viewport.modern !== false;
    if (/orientation:\s*landscape/.test(condition) && viewport.width <= viewport.height) return false;
    for (const match of condition.matchAll(/\((min|max)-(width|height):\s*([\d.]+)px\)/g)) {
      const size = viewport[match[2]], boundary = +match[3];
      if (match[1] === 'min' ? size < boundary : size > boundary) return false;
    }
    return true;
  });
}
const viewport = { width: 640, height: 360, modern: true };
const landscapeSizes = [[568, 320], [640, 360], [667, 375], [844, 390], [932, 430], [1024, 600], [1024, 768], [1280, 720]];
function landscapeCases() {
  return landscapeSizes.flatMap(([width, height]) => [
    { width, height, modern: false },
    { width, height, modern: true },
    // The 568x320 case represents a compact non-notched phone. Keep the
    // aggressive insets on larger devices where such hardware exists.
    ...(width > 568 ? [{ width, height, modern: true, 'safe-area-inset-left': 44, 'safe-area-inset-right': 44, 'safe-area-inset-top': 8, 'safe-area-inset-bottom': 21 }] : [])
  ]);
}
function style(selector, dimensions = viewport) {
  return Object.assign({}, ...rules.filter(rule => rule.selector === selector && applicable(rule, dimensions)).map(rule => rule.declarations));
}
function pixels(value, dimensions = viewport, variables = style(root, dimensions), resolving = []) {
  assert.equal(typeof value, 'string');
  value = value.replace(/var\((--[\w-]+)\)/g, (_, name) => {
    assert.ok(Object.hasOwn(variables, name), 'defined layout variable: ' + name);
    assert.ok(!resolving.includes(name), 'layout variable must not be cyclic: ' + [...resolving, name].join(' -> '));
    return '(' + pixels(variables[name], dimensions, variables, [...resolving, name]) + ')';
  });
  value = value.replace(/env\((safe-area-inset-[a-z]+)(?:,([^()]+))?\)/g, (_, name, fallback) => String(dimensions[name] || Number.parseFloat(fallback) || 0));
  value = value.replace(/([\d.]+)(rem|svh|vh|vw|px)/g, (_, count, unit) => String(+count * ({ rem: 16, svh: dimensions.height / 100, vh: dimensions.height / 100, vw: dimensions.width / 100, px: 1 })[unit]));
  const arithmetic = input => {
    assert.match(input, /^[\d.e+\-*/\s]+$/, 'only numeric test expressions are evaluated');
    return Function('return (' + input + ')')();
  };
  while (value.includes('(')) {
    let replaced = false;
    value = value.replace(/([a-z-]*)\(([^()]*)\)/g, (_, name, body) => {
      replaced = true; const parts = body.split(',').map(arithmetic);
      if (!name || name === 'calc') { assert.equal(parts.length, 1); return String(parts[0]); }
      if (name === 'max') return String(Math.max(...parts));
      if (name === 'min') return String(Math.min(...parts));
      assert.equal(name, 'clamp'); assert.equal(parts.length, 3);
      return String(Math.min(parts[2], Math.max(parts[0], parts[1])));
    });
    assert.ok(replaced, 'supported layout expression: ' + value);
  }
  const result = arithmetic(value); assert.ok(Number.isFinite(result)); return result;
}

test('mobile presentation rules cannot match an ordinary desktop root or activate portrait layout', () => {
  assert.ok(rules.length > 100, 'validate every actual rule, not just the first block');
  for (const rule of rules) {
    const gate = rule.selector.startsWith('.orientation-gate') || /^html\[data-client-(?:portrait|incompatible)=/.test(rule.selector);
    if (!gate) {
      const nativePlate = rule.selector === 'html[data-native-client="true"] .mission-stage';
      assert.ok(rule.selector.startsWith(root) || nativePlate, rule.selector + ' must be client-scoped');
      if (nativePlate) {
        assert.deepEqual(Object.keys(rule.declarations), ['background-image'], 'native format fallback changes no layout');
        continue;
      }
      if (rule.selector.includes('.offline-banner')) continue;
      assert.ok(rule.conditions.some(condition => /orientation:\s*landscape/.test(condition)), rule.selector);
      assert.equal(applicable(rule, { width: 390, height: 844 }), false);
    }
  }
  assert.equal(style('.orientation-gate[hidden]').display, 'none !important');
  assert.equal(style('html[data-client-portrait="true"] body').overflow, 'hidden');
});

test('the client reflows actual components rather than scaling or rotating the page', () => {
  for (const rule of rules) {
    assert.equal(rule.declarations.zoom, undefined, rule.selector);
    if (rule.declarations.transform) {
      assert.ok(rule.selector.includes('orientation-device'), 'only the small instruction glyph may rotate');
      assert.doesNotMatch(rule.declarations.transform, /scale\(/);
    }
    assert.notEqual(rule.declarations.width, '100vw', 'safe-area layout must not use overflowing full viewport width');
  }
  const navigation = style(root + ' .primary-nav');
  assert.equal(navigation['overflow-x'], 'auto'); assert.equal(navigation['min-width'], '0');
  assert.equal(style(root + ' .primary-nav a').flex, '0 0 auto', 'all navigation destinations remain reachable, never squeezed away');
});

test('navigation, native selectors, primary actions and gallery controls retain real touch targets', () => {
  for (const selector of ['.primary-nav a', '.language', '.station-select select', '.channel-list button', '.range-control button', '.photo-rail button', '.hero-scroll']) {
    assert.ok(pixels(style(root + ' ' + selector)['min-height']) >= 44, selector);
  }
  assert.ok(pixels(style(root + ' .hero-enter.solid-link')['min-height']) >= 48);
  assert.ok(pixels(style('.orientation-gate button')['min-height']) >= 48);
  const photoTracks = style(root + ' .photo-stage')['grid-template-rows'];
  assert.ok(pixels(photoTracks.match(/\s([\d.]+(?:px|rem))$/)[1]) >= 44);
  assert.equal(style(root + ' .photo-rail')['overflow-y'], 'auto');
});

test('safe areas and stable viewport height enhance usable zero-inset and vh fallbacks', () => {
  const legacy = { width: 844, height: 390, modern: false };
  const plain = style(root, legacy);
  assert.equal(plain['--client-screen'], '100vh');
  assert.equal(pixels(plain['--client-top'], legacy), 0); assert.equal(pixels(plain['--client-bottom'], legacy), 0);
  assert.ok(pixels(plain['--gutter'], legacy) >= 8);
  const notched = { ...legacy, modern: true, 'safe-area-inset-left': 44, 'safe-area-inset-right': 44, 'safe-area-inset-top': 8, 'safe-area-inset-bottom': 21 };
  const safe = style(root, notched);
  assert.equal(safe['--client-screen'], '100svh');
  assert.ok(pixels(safe['--gutter'], notched) >= 44);
  assert.equal(pixels(safe['--client-header'], notched) - pixels(plain['--client-header'], legacy), 8);
  assert.equal(pixels(safe['--client-bottom'], notched), 21);
});

test('responsive client gutters resolve through variable aliases and retain room on tablets and notched phones', () => {
  for (const dimensions of landscapeCases()) {
    const variables = style(root, dimensions);
    const gutter = pixels('var(--gutter)', dimensions);
    const clientGutter = pixels('var(--client-gutter)', dimensions);
    assert.ok(clientGutter >= 20, 'the fallback is a deliberate content margin, not the old narrow phone edge');
    assert.ok(gutter >= clientGutter, 'safe-area enhancement must never shrink the authored spacing');
    if (dimensions.modern) {
      assert.ok(gutter >= (dimensions['safe-area-inset-left'] || 0));
      assert.ok(gutter >= (dimensions['safe-area-inset-right'] || 0));
    } else {
      assert.equal(gutter, clientGutter, 'without env/max support, the fluid authored gutter still applies');
    }
    assert.ok(dimensions.width - 2 * gutter > dimensions.width * .8, 'safe spacing must retain a useful content width');
    assert.equal(pixels('var(--content-edge)', dimensions, { ...variables, '--content-edge': 'var(--gutter)' }), gutter,
      'nested var aliases must resolve through max/clamp and env, not be parsed as literal text');
  }
  assert.ok(pixels('var(--gutter)', { width: 1280, height: 720 }) > pixels('var(--gutter)', viewport),
    'tablet content must gain breathing room rather than keep the narrow-phone inset');
  assert.throws(() => pixels('var(--loop)', viewport, { '--loop': 'var(--loop)' }), /must not be cyclic/);
});

test('phone and tablet scenes retain normal-flow supporting copy without stretching the first scene', () => {
  for (const dimensions of landscapeCases()) {
    const { height } = dimensions, hero = style(root + ' .field-hero', dimensions);
    assert.equal(hero.height, 'auto'); assert.equal(pixels(hero['min-height'], dimensions), 0);
    const copy = style(root + ' .hero-copy', dimensions);
    assert.equal(copy.position, 'relative'); assert.equal(copy.inset, 'auto');
    assert.equal(pixels(copy['min-height'], dimensions), height);
    assert.ok(pixels(copy['padding-top'], dimensions) < height / 3, 'header cannot consume half the scene');
    const notes = style(root + ' .hero-field-notes', dimensions);
    assert.equal(notes.position, 'relative'); assert.equal(notes.inset, 'auto');
    assert.notEqual(notes.display, 'none', 'manifesto and telemetry are retained below the scene');
    const action = style(root + ' .hero-scroll', dimensions);
    const lower = pixels(action.top, dimensions) + pixels(action['min-height'], dimensions);
    assert.ok(lower <= height, 'the real scroll link is reachable above the screen bottom');
  }
});

test('the home CTA sinks into free flex space and clears the scroll action by at least 16px', () => {
  for (const dimensions of landscapeCases()) {
    const copy = style(root + ' .hero-copy', dimensions);
    const actions = style(root + ' .hero-actions', dimensions);
    assert.equal(copy.display, 'flex'); assert.equal(copy['flex-direction'], 'column');
    assert.equal(actions['margin-top'], 'auto', 'use remaining real layout space instead of a fixed translated gap');
    assert.equal(actions['flex-shrink'], '0', 'CTA must retain its full touch height on short screens');
    const buttonHeight = pixels(style(root + ' .hero-enter.solid-link', dimensions)['min-height'], dimensions);
    const copyHeight = pixels(copy['min-height'], dimensions);
    const buttonBottom = copyHeight - pixels(copy['padding-bottom'], dimensions);
    const buttonTop = buttonBottom - buttonHeight;
    const scroll = style(root + ' .hero-scroll', dimensions);
    const scrollTop = pixels(scroll.top, dimensions);
    assert.ok(buttonTop >= dimensions.height * .5, `${dimensions.width}x${dimensions.height}: primary action belongs in the lower half`);
    assert.ok(scrollTop - buttonBottom >= 16, 'explore and observations actions must have separate visual/touch lanes');
    assert.ok(scrollTop + pixels(scroll['min-height'], dimensions) <= dimensions.height - pixels('var(--client-bottom)', dimensions));

    // This is a conservative two-line typographic budget, not a font-rendering
    // assertion. Browser review still checks actual Chinese and English wraps.
    for (const language of ['zh', 'en']) {
      const title = { ...style(root + ' .hero-copy h1', dimensions),
        ...(language === 'en' ? style(root + '[data-lang="en"] .hero-copy h1', dimensions) : {}) };
      const titleHeight = 2 * pixels(title['font-size'], dimensions) * Number(title['line-height']);
      const titleBottom = pixels(copy['padding-top'], dimensions) + titleHeight;
      assert.ok(titleBottom + pixels(copy.gap, dimensions) <= buttonTop,
        `${dimensions.width}x${dimensions.height} ${language}: heading, gap, CTA and lower clearance fit without negative free space`);
    }
  }
});

test('hardware and location share one heading lane and a first-screen minimum scene budget', () => {
  const context = root + ' body:is([data-view="hardware"],[data-view="location"])';
  assert.equal(style(context + ' .route-page:not([hidden])').display, 'grid');
  assert.equal(style(context + ' .route-page>.page-title')['grid-row'], '1');
  assert.equal(style(root + ' body[data-view="hardware"] .route-page>.device-tabs')['grid-row'], '1');
  assert.equal(style(root + ' body[data-view="location"] .route-page>.network-toolbar')['grid-row'], '1');
  assert.equal(style(root + ' .instrument-legend').position, 'relative', 'hardware captions follow instead of covering the scene');
  for (const dimensions of landscapeCases()) {
    const heading = pixels(style(root + ' .page-title', dimensions)['min-height'], dimensions);
    const header = pixels('var(--client-header)', dimensions);
    const bottomInset = pixels('var(--client-bottom)', dimensions);
    assert.equal(heading, pixels('var(--client-heading)', dimensions), 'scene budget and rendered title use one shared token');
    assert.equal(pixels(style(root + ' .network-toolbar', dimensions)['min-height'], dimensions), heading);
    const photos = pixels(style(root + ' .photo-layout .instrument-stage.photo-mode', dimensions)['min-height'], dimensions);
    const structure = pixels(style(root + ' .instrument-stage>.field-frame', dimensions).height, dimensions);
    assert.equal(structure, photos, 'structure and photographs begin with the same minimum scene budget');
    assert.equal(pixels(style(root + ' .instrument-stage:not(.photo-mode)', dimensions)['padding-top'], dimensions), structure);
    assert.ok(header + heading + photos <= dimensions.height - bottomInset - 16,
      `${dimensions.width}x${dimensions.height}: unified heading and safe bottom must be deducted from the scene`);

    const gallery = style(root + ' .hardware-photo', dimensions), photo = style(root + ' .photo-stage', dimensions);
    const controlTrack = pixels(photo['grid-template-rows'].match(/\s([\d.]+(?:px|rem))$/)[1], dimensions);
    const touchHeight = pixels(style(root + ' :is(button,input,select,.solid-link,.outline-button,.quiet-link)', dimensions)['min-height'], dimensions);
    assert.ok(controlTrack >= touchHeight && touchHeight >= 44, 'photo controls occupy a real full-height track');
    const padding = pixels(gallery.padding, dimensions);
    const imageHeight = photos - 2 * padding - pixels(photo.gap, dimensions) - controlTrack;
    assert.ok(imageHeight >= 2 * controlTrack, 'the short-screen photograph remains useful above its controls');
    const controlsBottom = header + heading + photos - padding;
    assert.ok(controlsBottom <= dimensions.height - bottomInset - 16,
      'minimum-height gallery controls fit the initial screen; a taller dossier may extend the row through normal page scrolling');
  }
});

test('channel lists end inside the initial viewport and energy content is top aligned', () => {
  for (const dimensions of landscapeCases()) {
    const channels = style(root + ' .channel-list', dimensions);
    assert.equal(channels.position, 'sticky'); assert.equal(channels['align-self'], 'start');
    assert.equal(channels['overflow-y'], 'auto', 'all channels remain touch-scrollable inside the bounded rail');
    const initialTop = pixels('var(--client-header)', dimensions) + pixels('var(--client-heading)', dimensions);
    const listHeight = pixels(channels['max-height'], dimensions);
    const buttonHeight = pixels(style(root + ' .channel-list button', dimensions)['min-height'], dimensions);
    assert.ok(listHeight >= 3 * buttonHeight, 'retain multiple usable channel choices even on short screens');
    assert.ok(initialTop + listHeight <= dimensions.height - pixels('var(--client-bottom)', dimensions) - 16,
      'rail budget includes the initial title, not just its eventual sticky offset');
    assert.ok(pixels(channels.top, dimensions) + listHeight <= dimensions.height - pixels('var(--client-bottom)', dimensions));
    const energy = style(root + ' .energy-panel', dimensions);
    assert.equal(energy['align-self'], 'start', 'energy must not stretch to the full channel-table height');
    assert.equal(energy['justify-content'], 'flex-start', 'energy content must not drift toward the centre of a tall analysis row');
  }
});

test('compact hardware keeps both photographs readable with a full-width touch-control lane', () => {
  for (const dimensions of landscapeCases()) {
    const showcase = style(root + ' .hardware-showcase.photo-layout', dimensions);
    const columns = showcase['grid-template-columns'].match(/^minmax\(([^,]+),([\d.]+)fr\) minmax\(0,([\d.]+)fr\)$/);
    assert.ok(columns, 'metadata has a readable minimum and photographs receive the remaining width');
    assert.equal(style(root + ' .photo-layout .engineering-sheet', dimensions).display, 'contents');
    assert.equal(style(root + ' .photo-layout .hardware-file', dimensions)['grid-column'], '1');
    assert.equal(style(root + ' .photo-layout .hardware-telemetry', dimensions)['grid-column'], '1/-1');
    const frame = style(root + ' .photo-layout .instrument-stage.photo-mode', dimensions);
    const frameHeight = pixels(frame['min-height'], dimensions);
    assert.equal(frame.height, 'auto', 'long dossier text may increase the real photo area instead of leaving unused space');
    assert.equal(frame['align-self'], 'stretch', 'the gallery and dossier share their actual grid-row height');
    assert.equal(frame['grid-column'], '2');
    const usable = dimensions.width - 2 * pixels('var(--gutter)', dimensions) - pixels(showcase.gap, dimensions);
    const labelWidth = Math.max(pixels(columns[1], dimensions), usable * +columns[2] / (+columns[2] + +columns[3]));
    const frameWidth = usable - labelWidth;
    const gallery = style(root + ' .photo-layout .hardware-photo', dimensions);
    assert.equal(gallery['grid-template-columns'], 'repeat(2,minmax(0,1fr))');
    assert.equal(gallery['grid-template-rows'], 'minmax(0,1fr) 44px');
    const [rowGap, columnGap] = gallery.gap.split(' ').map(value => pixels(value, dimensions));
    const controlsWidth = 2 * 44 + pixels(style(root + ' .photo-layout .photo-index', dimensions)['min-width'], dimensions)
      + 2 * pixels(style(root + ' .photo-layout .photo-controls', dimensions).gap, dimensions);
    assert.ok(frameWidth >= controlsWidth, 'the shared control lane fits both unshrunk arrows, index and gaps');
    assert.equal(style(root + ' .photo-layout .photo-controls button', dimensions).flex, '0 0 44px');
    const photo = style(root + ' .photo-layout .photo-stage', dimensions);
    const captionHeight = pixels(photo['grid-template-rows'].match(/\s([^ ]+)$/)[1], dimensions);
    const imageHeight = frameHeight - 44 - rowGap - captionHeight - pixels(photo.gap, dimensions);
    const visibleImageWidth = Math.min((frameWidth - columnGap) / 2, imageHeight * 1279 / 1706);
    assert.ok(visibleImageWidth >= 80, `${dimensions.width}x${dimensions.height}: both complete images remain readable`);
    assert.equal(style(root + ' .photo-layout .photo-rail', dimensions).height, '100%');
    assert.ok(frameHeight + pixels('var(--client-header)', dimensions) + pixels('var(--client-heading)', dimensions)
      <= dimensions.height - pixels('var(--client-bottom)', dimensions) - 16,
      'the minimum scene budget fits the first screen; longer readable dossier content may grow in normal flow');
    assert.equal(gallery.padding, '0');
  }
});

test('map dossier, table and chart controls have independent bounded regions instead of page overflow', () => {
  const atlas = style(root + ' .atlas:not(.orbital-atlas)');
  assert.equal(atlas.display, 'grid'); assert.match(atlas['grid-template-columns'], /minmax\(0,1fr\)/);
  assert.equal(atlas.height, 'auto'); assert.equal(style(root + ' .atlas-dossier').position, 'relative');
  const ledger = style(root + ' .table-scroll');
  assert.equal(ledger.overflow, 'auto'); assert.equal(ledger['max-width'], '100%'); assert.equal(ledger['min-height'], '0');
  assert.match(ledger['touch-action'], /pan-x/); assert.match(ledger['touch-action'], /pan-y/);
  assert.equal(style(root + ' .table-scroll table')['min-width'], '100%');
  for (const [width, height] of [[640, 360], [667, 375], [844, 390], [932, 430]]) {
    const dimensions = { width, height };
    assert.ok(pixels(ledger.height, dimensions) >= 144 && pixels(ledger.height, dimensions) < height);
    assert.ok(pixels(style(root + ' .featured-chart', dimensions).height, dimensions) >= 144);
  }
  assert.equal(style(root + ' .channel-list')['overflow-y'], 'auto');
  assert.equal(style(root + ' .telemetry-access').position, undefined, 'the password gate is not floated over the table');
  assert.equal(style(root + ' .instrument-legend').position, 'relative', 'captions cannot cover the model');
  assert.equal(style(root + ' .coverage-row small').display, 'block', 'valid/total counts survive phone layout');
});

test('mobile type hierarchy separates controls, copy and metadata without shrinking touch targets', () => {
  const primary = [
    '.primary-nav a', '.station-select select', '.language', '.solid-link', '.hero-enter.solid-link',
    '.hero-manifesto', '.hero-scroll', '.observation-intro p', '.channel-list button span:nth-child(2)',
    '.range-control button', '.table-scroll table', '.telemetry-access input',
    '.view-tabs', '.atlas-dossier p', '.atlas-dossier .solid-link', '.node-entry h3', '.instrument-legend li',
    '.engineering-sheet dl>div', '.instrument-channels p', '.photo-layout .hardware-file h2',
    '.photo-layout .hardware-file dd', '.photo-layout .hardware-telemetry h2', '.coverage-row b',
    '.coverage-row strong', '.analysis-total>p', '.timeline h3'
  ];
  const auxiliary = [
    '.page-node', '.field-readout>span', '.hero-status :is(.data-badge,time)', '.field-foot',
    '.metric>span', '.channel-list button small', '.channel-list button b', '#recordCount',
    '.table-scroll thead th', '.table-scroll thead th small', '.mode-label', '.telemetry-access', '.telemetry-access [role=alert]',
    '.coordinates small', '.map-caption', '.orbital-copy>small', '.globe-copy>p', '.globe-copy>small',
    '.node-entry p', '.node-entry small', '.instrument-legend>p', '.photo-layout .photo-caption',
    '.photo-layout .photo-rail button>.photo-caption', '.photo-layout .photo-index',
    '.photo-layout .hardware-file dt', '.photo-layout .hardware-file dl>div:first-child dt',
    '.photo-layout .hardware-file dl>div:last-child dd', '.photo-layout .hardware-telemetry>p',
    '.photo-layout .hardware-metrics .metric>span', '.coverage-row small', '.energy-panel p',
    '.energy-panel>small', '.energy-ring span', '.timeline time'
  ];
  for (const dimensions of landscapeCases()) {
    for (const selector of primary) {
      const size = pixels(style(root + ' ' + selector, dimensions)['font-size'], dimensions);
      assert.ok(size >= 14 && size <= 16, selector);
    }
    for (const selector of auxiliary) assert.equal(pixels(style(root + ' ' + selector, dimensions)['font-size'], dimensions), 13, selector);
    assert.equal(pixels(style(root + ' body', dimensions)['font-size'], dimensions), 15);
    assert.equal(pixels(style(root + ' .primary-nav a', dimensions)['font-size'], dimensions), 14);
    assert.equal(pixels(style(root + ' .telemetry-access input', dimensions)['font-size'], dimensions), 16, 'text entry stays full-size');
    assert.equal(pixels(style(root + ' .metric>strong', dimensions)['font-size'], dimensions), 24, 'readings keep their visual emphasis');
    assert.equal(pixels(style(root + ' .signal-value', dimensions)['font-size'], dimensions), 36);
    assert.ok(pixels(style(root + ' .trend-workspace', dimensions)['grid-template-columns'].split(' ')[0], dimensions) >= 168,
      'the channel rail retains enough room for translated labels');
  }
});

test('enlarged hardware labels and coverage counts have explicit compact reflow', () => {
  const fields = style(root + ' .photo-layout .hardware-file dl>div');
  assert.equal(fields.display, 'grid');
  assert.match(fields['grid-template-columns'], /minmax\(0,1\.2fr\)/, 'the value column may shrink and wrap, never force page overflow');
  assert.equal(style(root + ' .photo-layout .hardware-file dl')['grid-template-columns'], '1fr');
  assert.equal(style(root + ' .photo-layout .hardware-file dl>div:last-child').display, 'block', 'deployment text uses the full dossier width');
  assert.equal(style(root + ' .coverage-row b')['grid-row'], '1');
  assert.equal(style(root + ' .coverage-row strong')['grid-row'], '1');
  assert.equal(style(root + ' .coverage-track')['grid-row'], '2');
  assert.equal(style(root + ' .coverage-row small')['grid-row'], '2', 'large count text is below the label, not competing in a five-column row');
  assert.equal(style(root + ' .metric>strong')['white-space'], 'normal', 'long units may wrap instead of escaping a card');
});

test('compact English equipment labels use full cells and preserve uncropped photographs', () => {
  const english = root + '[data-lang="en"] .photo-layout .hardware-file';
  for (const dimensions of [{ width: 568, height: 320 }, { width: 640, height: 360 }]) {
    assert.equal(style(english + ' dl', dimensions)['grid-template-columns'], 'repeat(2,minmax(0,1fr))');
    assert.equal(style(english + ' dl>div', dimensions).display, 'block', 'labels must not compete with values in a narrow inline column');
    assert.equal(style(english + ' dl>div:nth-child(4)', dimensions)['grid-column'], '1/-1', 'Communication receives the whole dossier width');
    assert.equal(style(english + ' dt', dimensions)['overflow-wrap'], 'normal', 'do not break Communication in the middle of the word');
  }
  assert.deepEqual(style(english + ' dl', { width: 844, height: 390 }), {}, 'larger phones retain the compact inline dossier');
  const desktop = fs.readFileSync(path.join(__dirname, '../css/expedition-studio.css'), 'utf8');
  assert.match(desktop, /\.hardware-main-image\s*\{[^}]*object-fit:\s*contain/);
  assert.match(desktop, /\.photo-rail img\s*\{[^}]*object-fit:\s*contain/);
});

test('short phones preserve room for geographic labels and full-size chart axis names', () => {
  for (const dimensions of [{ width: 568, height: 320 }, { width: 640, height: 360 }, { width: 844, height: 390 }]) {
    assert.ok(pixels(style(root + ' .orbital-atlas', dimensions)['min-height'], dimensions) >= 256,
      'two geographic labels and touch controls must not collapse onto each other');
    assert.ok(pixels(style(root + ' .globe-stage', dimensions)['min-height'], dimensions) >= 320,
      'translated global-view copy has a real height budget');
    assert.ok(pixels(style(root + ' .featured-chart', dimensions).height, dimensions) >= 224,
      'the larger vertical axis title must fit instead of being cropped by a tiny canvas');
  }
});
