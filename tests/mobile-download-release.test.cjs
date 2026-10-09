const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const root = path.join(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const app = read('js/expedition-app.js');
const download = app.slice(app.indexOf('  function download()'), app.indexOf('  function cancelChartRender()'));

test('public downloads offer the verified new preview while retaining original packages honestly', () => {
  for (const english of [false, true]) {
    const html = vm.runInNewContext(download + ';download()', {
      client: { native: false }, station: 'a03', t: (zh,en) => english ? en : zh
    });
    assert.match(html, /class="solid-link" href="\.\/install\.html"/);
    assert.match(html, /station=a03&client=mobile/);
    assert.match(html, /2\.0\.2/);
    assert.match(html, /WebView 90\+/);
    assert.match(html, /2\.0\.0/);
    assert.match(html, /1\.7/);
    assert.match(html, /href="\.\/apk\/DMS-antarctic\.apk"/);
    assert.match(html, /bb40a21\/apk\/DMS-antarctic\.apk/);
    assert.doesNotMatch(html, /class="solid-link" href="https:\/\/cdn/);
  }
});

test('legacy download fallback offers the same preview, signing warning and original links', () => {
  const html = read('download.html');
  assert.match(html, /http-equiv="refresh" content="0;url=\.\/install\.html"/);
  assert.match(html, /href="\.\/apk\/DMS-antarctic-2\.0\.2-preview\.apk" download/);
  assert.match(html, /不能覆盖原 1\.7/);
  assert.match(html, /尚未完成真机兼容验证/);
  assert.match(html, /href="\.\/apk\/DMS-antarctic\.apk"/);
  assert.match(html, /min-height:48px/);
});

test('the previous 2.0.1 APK remains byte-for-byte intact', () => {
  const apk = fs.readFileSync(path.join(root, 'apk/DMS-antarctic-2.0.1-preview.apk'));
  assert.equal(apk.length, 9111035);
  assert.equal(crypto.createHash('sha256').update(apk).digest('hex'), 'ed889e5fde4a47134d00fcfa07eb89619df47b4d05244216f918fa228332b183');
});
