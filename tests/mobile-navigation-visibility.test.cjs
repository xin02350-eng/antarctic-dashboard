const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const app = fs.readFileSync(path.join(__dirname, '../js/expedition-app.js'), 'utf8');
const start = app.indexOf('  function keepMobileNavigationVisible(){');
const end = app.indexOf('  function scene(', start);
assert.ok(start > 0 && end > start);
const source = app.slice(start, end);

function fixture({ mobile = true, present = true, active = true, width = 240, total = 420, scroll = 0,
  left = 60, border = 0, itemLeft = 340, itemRight = 420 } = {}) {
  const reads = { header: 0, nav: 0, selected: 0, boxes: 0 }, writes = [];
  const forbidden = () => assert.fail('navigation visibility must not scroll/focus the document or create a loop');
  const item = { getBoundingClientRect() { reads.boxes++; return { left: itemLeft, right: itemRight }; },
    scrollIntoView: forbidden, focus: forbidden };
  const nav = { clientWidth: width, scrollWidth: total, clientLeft: border,
    get scrollLeft() { return scroll; }, set scrollLeft(value) { writes.push(value); scroll = value; },
    getBoundingClientRect() { reads.boxes++; return { left }; },
    querySelector(selector) { reads.selected++; assert.equal(selector, '[aria-current="page"]'); return active ? item : null; },
    scrollIntoView: forbidden, focus: forbidden };
  const header = { querySelector(selector) { reads.nav++; assert.equal(selector, '.primary-nav'); return present ? nav : null; } };
  const context = {
    client: mobile === null ? undefined : { mobile },
    $(id) { reads.header++; assert.equal(id, 'appHeader'); return header; },
    window: { scroll: forbidden, scrollTo: forbidden, scrollBy: forbidden, addEventListener: forbidden },
    document: { addEventListener: forbidden }, requestAnimationFrame: forbidden, setTimeout: forbidden, setInterval: forbidden
  };
  vm.runInNewContext(source, context);
  return { reads, writes, run: context.keepMobileNavigationVisible, current: () => scroll };
}

test('the header keeps its active link visible after each real render without a new listener or scene mutation', () => {
  const header = app.slice(app.indexOf('  function header() {'), start);
  assert.equal((header.match(/keepMobileNavigationVisible\(\)/g) || []).length, 1);
  assert.ok(header.indexOf('keepMobileNavigationVisible()') > header.indexOf('document.body.dataset.view=active'));
  assert.doesNotMatch(source, /scrollIntoView|scrollTo\(|scrollBy\(|requestAnimationFrame|setTimeout|setInterval|addEventListener|iframe|\.focus\(/);
});

test('desktop and absent client metadata never measure or move the navigation rail', () => {
  for (const mobile of [false, null]) {
    const f = fixture({ mobile }); f.run();
    assert.deepEqual(f.reads, { header: 0, nav: 0, selected: 0, boxes: 0 });
    assert.deepEqual(f.writes, []);
  }
});

test('a missing, hidden or nonoverflowing rail incurs no box measurements and no scroll assignment', () => {
  for (const options of [{ present: false }, { width: 0 }, { width: 420, total: 420 }, { width: 480, total: 420 }]) {
    const f = fixture(options); f.run();
    assert.equal(f.reads.boxes, 0); assert.equal(f.reads.selected, 0); assert.deepEqual(f.writes, []);
  }
});

test('footer-only routes with no active primary link leave the rail untouched', () => {
  const f = fixture({ active: false }); f.run();
  assert.equal(f.reads.selected, 1); assert.equal(f.reads.boxes, 0); assert.deepEqual(f.writes, []);
});

test('a right-hidden current page moves only enough to reveal its right edge', () => {
  const f = fixture({ itemLeft: 340, itemRight: 420 }); f.run();
  assert.deepEqual(f.writes, [120]); assert.equal(f.current(), 120);
  assert.equal(f.reads.boxes, 2, 'one rail and one current-link measurement');
});

test('a left-hidden current page returns into the visible rail without scrolling the page', () => {
  const f = fixture({ scroll: 170, itemLeft: 25, itemRight: 105 }); f.run();
  assert.deepEqual(f.writes, [135]); assert.equal(f.current(), 135);
});

test('fully visible links, including exact edges, do not assign scrollLeft', () => {
  for (const [itemLeft, itemRight] of [[80, 160], [60, 140], [220, 300], [60, 300]]) {
    const f = fixture({ scroll: 90, itemLeft, itemRight }); f.run();
    assert.deepEqual(f.writes, []); assert.equal(f.current(), 90);
  }
});

test('client borders and fractional positions are included in the visible scrollport', () => {
  const right = fixture({ border: 2, itemLeft: 230, itemRight: 310.5 }); right.run();
  assert.deepEqual(right.writes, [8.5]);
  const left = fixture({ border: 2, scroll: 80, itemLeft: 60.5, itemRight: 130 }); left.run();
  assert.deepEqual(left.writes, [78.5]);
});

test('scroll updates are clamped to the real range and never rewrite an unchanged boundary', () => {
  const right = fixture({ scroll: 160, itemLeft: 400, itemRight: 500 }); right.run(); assert.deepEqual(right.writes, [180]);
  const left = fixture({ scroll: 10, itemLeft: 10, itemRight: 90 }); left.run(); assert.deepEqual(left.writes, [0]);
  const boundary = fixture({ scroll: 180, itemLeft: 400, itemRight: 500 }); boundary.run(); assert.deepEqual(boundary.writes, []);
});

test('an oversized active link prioritizes its label start instead of oscillating between edges', () => {
  const f = fixture({ scroll: 100, itemLeft: 20, itemRight: 350 }); f.run();
  assert.deepEqual(f.writes, [60]);
  const aligned = fixture({ scroll: 60, itemLeft: 60, itemRight: 390 }); aligned.run();
  assert.deepEqual(aligned.writes, []);
});
