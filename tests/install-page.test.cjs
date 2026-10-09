const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const html = fs.readFileSync(path.join(__dirname, '..', 'install.html'), 'utf8');
const css = html.match(/<style>([\s\S]*?)<\/style>/)[1];

test('published download metadata matches the exact verified APK bytes', () => {
  const apk = fs.readFileSync(path.join(__dirname, '..', 'apk/DMS-antarctic-2.0.2-preview.apk'));
  assert.equal(apk.length, 9286245);
  const digest = crypto.createHash('sha256').update(apk).digest('hex');
  assert.equal(digest, '5c64197774414d009572b4f57cdc19e989fe01ed52e279ea049b04c68987139a');
  assert.ok(html.includes(`id="apk-sha256">${digest}</dd>`));
  assert.ok(html.includes(`id="apk-size">${(apk.length / 1048576).toFixed(2)} MiB</span>`));
});

test('installer is a direct, same-origin APK download with a normal web fallback', () => {
  assert.match(html, /<a\b[^>]*class="download-link"[^>]*href="\.\/apk\/DMS-antarctic-2\.0\.2-preview\.apk"[^>]*download="DMS-antarctic-2\.0\.2-preview\.apk"/);
  assert.match(html, /href="\.\/expedition\.html\?view=dashboard&amp;client=mobile"/);
  assert.match(html, /class="legacy-link" href="\.\/apk\/DMS-antarctic\.apk" download="DMS-antarctic\.apk">下载旧版 1\.7/);
  assert.doesNotMatch(html, /<script\b|http-equiv\s*=\s*["']refresh|\bonclick\s*=/i);
});

test('download page stays lightweight and never imports the 3D or orientation shell', () => {
  assert.doesNotMatch(html, /<(?:script|iframe|canvas|video|img)\b|<link\b[^>]*\b(?:stylesheet|preload|prefetch)\b/i);
  assert.doesNotMatch(css, /@import|url\s*\(|animation\s*:|backdrop-filter/);
  assert.doesNotMatch(html, /screen\.orientation|requestFullscreen|expedition-client|polar-shell|manifest\.webmanifest/);
  assert.ok(Buffer.byteLength(html) < 12 * 1024, 'download page should stay below 12 KiB without other requests');
});

test('portrait and landscape share a fluid layout with safe-area and scalable text', () => {
  assert.match(html, /name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/);
  assert.doesNotMatch(html, /user-scalable\s*=\s*no|maximum-scale\s*=\s*1|orientation:\s*portrait/);
  for (const edge of ['top', 'right', 'bottom', 'left']) assert.match(css, new RegExp(`env\\(safe-area-inset-${edge}\\)`));
  assert.match(css, /min-height:100vh;min-height:100dvh/);
  assert.match(css, /\.shell\{width:100%;max-width:70rem/);
  assert.match(css, /@media \(min-width:800px\)/);
  assert.match(css, /overflow-wrap:anywhere;word-break:break-all/);
});

test('download, web fallback and installation details provide at least 48px touch targets', () => {
  for (const selector of ['download-link', 'web-link', 'legacy-link']) {
    const rule = css.match(new RegExp(`\\.${selector}\\{([^}]+)\\}`))[1];
    const height = Number(rule.match(/min-height:([\d.]+)rem/)[1]);
    assert.ok(height >= 3, `${selector} must have a minimum 3rem touch target`);
  }
  const summaryRule = css.match(/summary\{([^}]+)\}/)[1];
  assert.ok(Number(summaryRule.match(/min-height:([\d.]+)rem/)[1]) >= 3);
  assert.match(css, /a:focus-visible,summary:focus-visible\{outline:2px solid/);
  assert.match(html, /<details class="installation">[\s\S]*?<summary>安装说明与兼容性<\/summary>/);
});

test('compatibility limits, signature limitations and browser installation are stated honestly', () => {
  assert.match(html, /Android 5\.1 及以上/);
  assert.match(html, /WebView 90 及以上/);
  assert.match(html, /采用调试签名/);
  assert.match(html, /尚未完成全部真机兼容验证/);
  assert.match(html, /相同签名的 2\.0\.0 \/ 2\.0\.1/);
  assert.match(html, /不能覆盖安装原版 1\.7/);
  assert.match(html, /iPhone 无法安装 APK/);
  assert.match(html, /微信内[\s\S]*?在浏览器打开/);
  assert.match(html, /id="apk-size"/);
  assert.match(html, /id="apk-sha256"/);
});
