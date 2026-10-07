const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const shell = require('../js/polar-shell.js');
const source = fs.readFileSync(path.join(__dirname, '../network.html'), 'utf8');
const entry = source.match(/<script id="network-entry">([\s\S]*?)<\/script>/)[1];

function route({ width = 1280, height = 720, coarse = false, search = '', replace = true } = {}) {
  const calls = [];
  const location = { pathname: '/antarctic-dashboard/network.html', search };
  if (replace) location.replace = value => calls.push(value);
  const window = { innerWidth: width, innerHeight: height, location, matchMedia(query) {
    assert.ok(['(min-width: 769px)', '(pointer: coarse)'].includes(query));
    return { matches: query === '(pointer: coarse)' ? coarse : width >= 769 };
  } };
  // The early entrance cannot need a parsed body, another script, a timer or a network request.
  vm.runInNewContext(entry, { URLSearchParams, window, location });
  return { calls, window };
}

test('network bookmark resolves before any external legacy map stylesheet or script', () => {
  const entries = [...source.matchAll(/<script id="network-entry">([\s\S]*?)<\/script>/g)];
  assert.equal(entries.length, 1);
  const end = entries[0].index + entries[0][0].length;
  for (const resource of source.matchAll(/<(?:script\b[^>]*\bsrc|link\b[^>]*\bhref)="(https?:[^\"]+)"[^>]*>/gi)) {
    assert.ok(end < resource.index, 'external legacy resource must follow the entrance: ' + resource[1]);
  }
  assert.ok(end < source.indexOf('<style>'));
  assert.doesNotMatch(entries[0][0], /\b(?:src|defer|async)=/);
  assert.match(source, /<script src="https:\/\/unpkg\.com\/leaflet\/dist\/leaflet\.js"><\/script>/,
    'the explicit legacy view retains its original map dependency');
});

test('desktop network bookmarks retain all valid stations and the network view', () => {
  for (const station of ['a01', 'a02', 'a03']) {
    assert.deepEqual(route({ search: '?station=' + station }).calls,
      ['./expedition.html?view=network&station=' + station]);
  }
  assert.deepEqual(route().calls, ['./expedition.html?view=network&station=a01']);
  assert.deepEqual(route({ search: '?view=globe&station=a03' }).calls,
    ['./expedition.html?view=network&station=a03'], 'the source page determines its view, as in polar-shell');
});

test('invalid station input cannot change the destination or introduce extra query parameters', () => {
  for (const station of ['', 'a00', 'a04', 'A01', 'a01-extra', 'a02&client=mobile', 'https://example.test', '../a02']) {
    assert.deepEqual(route({ search: '?station=' + encodeURIComponent(station) }).calls,
      ['./expedition.html?view=network&station=a01']);
  }
  assert.deepEqual(route({ search: '?station=a02&station=a03' }).calls,
    ['./expedition.html?view=network&station=a02'], 'first query value agrees with the existing entrance');
});

test('ordinary phones enter the same landscape client in portrait and landscape', () => {
  for (const [width, height] of [[393, 852], [640, 360], [667, 375], [844, 390], [932, 430], [1024, 768]]) {
    assert.deepEqual(route({ width, height, coarse: true, search: '?station=a03' }).calls,
      ['./expedition.html?view=network&station=a03&client=mobile']);
  }
  assert.deepEqual(route({ width: 1440, height: 900, coarse: true }).calls,
    ['./expedition.html?view=network&station=a01'], 'large touch computers retain the desktop entrance');
});

test('narrow mouse windows stay on the original responsive network unless client mode is explicit', () => {
  for (const width of [360, 640, 768]) {
    assert.deepEqual(route({ width }).calls, []);
    assert.deepEqual(route({ width, search: '?client=mobile&station=a02' }).calls,
      ['./expedition.html?view=network&station=a02&client=mobile']);
    for (const search of ['?notclient=mobile', '?client=mobile-ish', '?client=Mobile']) {
      assert.deepEqual(route({ width, search }).calls, []);
    }
  }
  assert.deepEqual(route({ width: 769 }).calls, ['./expedition.html?view=network&station=a01']);
});

test('legacy opt-out is exact and works for desktop, detected phones and explicit mobile mode', () => {
  for (const options of [{}, { width: 393, height: 852, coarse: true }, { width: 640 }]) {
    for (const search of ['?legacy=1', '?station=a03&client=mobile&legacy=1']) {
      assert.deepEqual(route({ ...options, search }).calls, []);
    }
  }
  for (const search of ['?legacy=0', '?legacy=01', '?notlegacy=1']) {
    assert.deepEqual(route({ search }).calls, ['./expedition.html?view=network&station=a01']);
  }
  assert.deepEqual(route({ replace: false }).calls, [], 'unsupported replacement keeps the original page available');
});

test('early network routing agrees with the shared shell across device and query combinations', () => {
  for (const [width, height, coarse] of [[640, 720, false], [769, 720, false], [393, 852, true], [844, 390, true], [1440, 900, true]]) {
    for (const search of ['', '?station=a02', '?station=bad', '?client=mobile', '?view=globe&station=a03', '?legacy=1', '?client=mobile&legacy=1']) {
      const h = route({ width, height, coarse, search });
      const mobile = shell.isMobileClient(h.window);
      const destination = shell.desktopRoute('network.html', search, mobile);
      assert.deepEqual(h.calls, (width >= 769 || mobile) && destination ? [destination] : []);
    }
  }
});

test('short-screen redirected clients cannot bounce back from expedition to the old network', () => {
  const destination = new URL(route({ width: 393, height: 852, coarse: true }).calls[0], 'https://example.test/antarctic-dashboard/');
  assert.equal(destination.searchParams.get('client'), 'mobile');
  const app = fs.readFileSync(path.join(__dirname, '../js/expedition-app.js'), 'utf8');
  const callback = app.slice(app.indexOf('  function useMobileLayout()'), app.indexOf('  readRoute();if(useMobileLayout())'));
  const redirects = [];
  vm.runInNewContext(callback + ';useMobileLayout();', {
    client: { mobile: true }, window: { matchMedia: () => ({ matches: false }) },
    location: { replace: value => redirects.push(value) }
  });
  assert.deepEqual(redirects, []);
});
