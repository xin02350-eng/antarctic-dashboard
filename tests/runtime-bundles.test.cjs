'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const vm = require('node:vm');
const zlib = require('node:zlib');
const { scriptTags, assertCurrentBundle } = require('./helpers/runtime.cjs');
const { SOURCE_GROUPS, buildRuntimeBundles, normalizeSource, parseArgs } = require('../scripts/build-runtime-bundles.cjs');
const root = path.resolve(__dirname, '..');
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'dms-runtime-test-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  fs.mkdirSync(path.join(directory, 'js'));
  for (const file of new Set(Object.values(SOURCE_GROUPS).flat())) {
    // Deliberately omit terminal semicolons to catch unsafe IIFE concatenation.
    fs.writeFileSync(path.join(directory, file), `/*! Copyright DMS; fixture retained. */\n(function () { window.order.push(${JSON.stringify(file)}); })()\n// end\n`);
  }
  return directory;
}

test('explicit runtime groups preserve dependency order and exclude the compatibility client and Three', () => {
  assert.deepEqual(Object.keys(SOURCE_GROUPS), ['app', 'field', 'earth']);
  assert.deepEqual(SOURCE_GROUPS.app.slice(0, 3), ['js/expedition-dependencies.js', 'js/expedition-data.js', 'js/telemetry-access.js']);
  assert.equal(SOURCE_GROUPS.app.at(-1), 'js/expedition-app.js');
  assert.deepEqual(SOURCE_GROUPS.field.slice(-2), ['js/polar-scene.js', 'js/field-frame.js']);
  assert.equal(SOURCE_GROUPS.earth.at(-1), 'js/expedition-globe.js');
  assert.ok(Object.values(SOURCE_GROUPS).flat().every(file => !/expedition-client|three\.min/.test(file)));
});

test('generated output executes each script exactly once in order, retains comments and uses actual byte hashes', async t => {
  const directory = fixture(t);
  const manifest = await buildRuntimeBundles({ rootDir: directory, minify: false });
  for (const [name, bundle] of Object.entries(manifest.bundles)) {
    const bytes = fs.readFileSync(path.join(directory, bundle.file));
    const window = { order: [] };
    vm.runInNewContext(bytes.toString('utf8'), { window });
    assert.deepEqual(window.order, SOURCE_GROUPS[name]);
    assert.equal(bundle.sha256, digest(bytes));
    assert.match(bundle.file, new RegExp(`${name}\\.${digest(bytes).slice(0, 12)}\\.js$`));
    assert.equal(bundle.bytes, bytes.length);
    assert.equal(bundle.gzipBytes, zlib.gzipSync(bytes, { level: 9 }).length);
    assert.equal(bundle.src, './' + bundle.file);
    assert.equal(bundle.url, bundle.src);
    assert.equal((bytes.toString().match(/Copyright DMS; fixture retained/g) || []).length, SOURCE_GROUPS[name].length);
    for (const source of bundle.sources) {
      assert.equal(source.sha256, digest(normalizeSource(fs.readFileSync(path.join(directory, source.file), 'utf8'))));
    }
  }
});

test('line endings do not change bundles, idempotent builds preserve files, and checking never writes', async t => {
  const directory = fixture(t);
  const first = await buildRuntimeBundles({ rootDir: directory, minify: false });
  const manifestFile = path.join(directory, 'assets/runtime/manifest.json');
  const firstMtime = fs.statSync(manifestFile).mtimeMs;
  for (const file of new Set(Object.values(SOURCE_GROUPS).flat())) {
    const target = path.join(directory, file);
    fs.writeFileSync(target, '\uFEFF' + fs.readFileSync(target, 'utf8').replace(/\n/g, '\r\n'));
  }
  assert.deepEqual(await buildRuntimeBundles({ rootDir: directory, minify: false }), first);
  assert.equal(fs.statSync(manifestFile).mtimeMs, firstMtime);
  assert.deepEqual(await buildRuntimeBundles({ rootDir: directory, check: true }), first);
  assert.equal(fs.statSync(manifestFile).mtimeMs, firstMtime);
});

test('stale sources and corrupted assets fail checks, rebuilding keeps the old hash available', async t => {
  const directory = fixture(t);
  const first = await buildRuntimeBundles({ rootDir: directory, minify: false });
  const manifestFile = path.join(directory, 'assets/runtime/manifest.json');
  const manifestBefore = fs.readFileSync(manifestFile);
  const sourceFile = path.join(directory, SOURCE_GROUPS.app[0]);
  fs.appendFileSync(sourceFile, '\nwindow.revision = 2;\n');
  await assert.rejects(buildRuntimeBundles({ rootDir: directory, check: true }), /stale or damaged/);
  assert.ok(fs.readFileSync(manifestFile).equals(manifestBefore), '--check must not silently repair a release');
  const second = await buildRuntimeBundles({ rootDir: directory, minify: false });
  assert.notEqual(second.bundles.app.src, first.bundles.app.src);
  assert.ok(fs.existsSync(path.join(directory, first.bundles.app.file)), 'old version remains requestable');
  fs.appendFileSync(path.join(directory, second.bundles.field.file), '\n/* corruption */\n');
  await assert.rejects(buildRuntimeBundles({ rootDir: directory, check: true }), /stale or damaged/);
  await buildRuntimeBundles({ rootDir: directory, minify: false });
  await assert.doesNotReject(buildRuntimeBundles({ rootDir: directory, check: true }));
});

test('checked-in runtime manifest agrees with sources and every published output', async () => {
  await assert.doesNotReject(buildRuntimeBundles({ rootDir: root, check: true }));
});

test('actual HTML keeps the classic compatibility client before app and shared Three before each scene bundle', () => {
  const app = assertCurrentBundle('expedition.html', 'app');
  const appScripts = scriptTags('expedition.html');
  assert.equal(appScripts.length, 2);
  assert.match(appScripts[0].src, /^\.\/js\/expedition-client\.js\?v=/);
  assert.equal(appScripts[1].src, app.src);
  assert.match(appScripts[0].tag, /\sdefer(?:\s|>)/);
  assert.doesNotMatch(appScripts[0].tag, /\sasync(?:\s|>|=)|\stype\s*=\s*["']module["']/i);
  assert.ok(!app.sources.some(source => source.file === 'js/expedition-client.js'));
  for (const [file, name] of [['field-frame.html', 'field'], ['globe-frame.html', 'earth']]) {
    const bundle = assertCurrentBundle(file, name), scripts = scriptTags(file);
    assert.deepEqual(scripts.map(script => script.src), ['./assets/three.min.js', bundle.src]);
    assert.match(scripts[0].tag, /\sdefer(?:\s|>)/);
    assert.doesNotMatch(scripts[0].tag, /\sasync(?:\s|>|=)|\stype\s*=\s*["']module["']/i);
  }
});

test('rebuilding synchronizes marked entry scripts and preloads while preserving unrelated HTML and CRLF', async t => {
  const directory = fixture(t);
  const htmlFile = path.join(directory, 'expedition.html');
  const entry = '<!doctype html>\r\n<script>\r\n' +
    "  preload('./assets/runtime/field.old.js', 'script'); // runtime-preload:field\r\n" +
    '  const earth = "./assets/runtime/earth.old.js"; // runtime-preload:earth\r\n' +
    '</script>\r\n<!-- runtime:app -->\r\n<script defer src="./assets/runtime/app.old.js"></script>\r\n<!-- /runtime:app -->\r\n' +
    '<p data-untouched="yes">正文</p>\r\n';
  fs.writeFileSync(htmlFile, entry);
  const unmarkedFile = path.join(directory, 'globe-frame.html');
  const unmarked = '<script src="./unmanaged-original.js"></script>\r\n';
  fs.writeFileSync(unmarkedFile, unmarked);
  const first = await buildRuntimeBundles({ rootDir: directory, minify: false });
  const expected = entry.replace('./assets/runtime/app.old.js', first.bundles.app.src)
    .replace('./assets/runtime/field.old.js', first.bundles.field.src)
    .replace('./assets/runtime/earth.old.js', first.bundles.earth.src);
  assert.equal(fs.readFileSync(htmlFile, 'utf8'), expected);
  assert.equal(fs.readFileSync(unmarkedFile, 'utf8'), unmarked);
  await assert.doesNotReject(buildRuntimeBundles({ rootDir: directory, check: true }));
  fs.writeFileSync(htmlFile, expected.replace(first.bundles.field.src, './assets/runtime/field.stale.js'));
  await assert.rejects(buildRuntimeBundles({ rootDir: directory, check: true }), /expedition\.html/);
  assert.ok(fs.readFileSync(htmlFile, 'utf8').includes('field.stale.js'), '--check must not update entry URLs');
  fs.appendFileSync(path.join(directory, SOURCE_GROUPS.app[0]), '\nwindow.newRelease = true;\n');
  const second = await buildRuntimeBundles({ rootDir: directory, minify: false });
  assert.notEqual(second.bundles.app.src, first.bundles.app.src);
  assert.ok(fs.readFileSync(htmlFile, 'utf8').includes(second.bundles.app.src));
  assert.ok(!fs.readFileSync(htmlFile, 'utf8').includes('field.stale.js'));
  await assert.doesNotReject(buildRuntimeBundles({ rootDir: directory, check: true }));
});

test('malformed managed blocks fail before any assets or entry files are written', async t => {
  const directory = fixture(t);
  const htmlFile = path.join(directory, 'field-frame.html');
  for (const broken of [
    '<!-- runtime:field -->',
    '<!-- runtime:field --><script src="old.js"></script><!-- /runtime:field -->',
    '<!-- runtime:field --><script defer src="old.js">run()</script><!-- /runtime:field -->',
    '<script>const field = 123; // runtime-preload:field\n</script>'
  ]) {
    fs.writeFileSync(htmlFile, broken);
    await assert.rejects(buildRuntimeBundles({ rootDir: directory, minify: false }), /Invalid runtime/);
    assert.equal(fs.readFileSync(htmlFile, 'utf8'), broken);
    assert.equal(fs.existsSync(path.join(directory, 'assets/runtime/manifest.json')), false);
  }
});

test('importing the builder is side-effect free and CLI options reject ambiguous input', () => {
  const writes = [];
  const sandbox = {
    __dirname: path.join(root, 'scripts'),
    module: { exports: {} },
    require(name) {
      if (name === 'node:fs') return { ...fs, writeFileSync: (...args) => writes.push(args), mkdirSync: (...args) => writes.push(args) };
      return require(name);
    }
  };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'scripts/build-runtime-bundles.cjs'), 'utf8'), sandbox);
  assert.equal(typeof sandbox.module.exports.buildRuntimeBundles, 'function');
  assert.deepEqual(writes, []);
  assert.deepEqual(parseArgs(['--check', '--no-minify', '--dependencies', '/existing/node_modules']), { check: true, minify: false, dependencies: '/existing/node_modules' });
  assert.throws(() => parseArgs(['--dependencies']), /requires/);
  assert.throws(() => parseArgs(['--dependencies', '--check']), /requires/);
  assert.throws(() => parseArgs(['--typo']), /Unknown option/);
});
