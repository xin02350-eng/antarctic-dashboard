'use strict';
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { normalizeSource } = require('../../scripts/build-runtime-bundles.cjs');
const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const manifest = () => JSON.parse(read('assets/runtime/manifest.json'));
const bundleFor = name => manifest().bundles[name];
const digest = contents => crypto.createHash('sha256').update(contents).digest('hex');

function scriptTags(file) {
  return [...read(file).matchAll(/<script\b[^>]*\ssrc\s*=\s*(["'])([^"']+)\1[^>]*>/gi)]
    .map(match => ({ tag: match[0], src: match[2], index: match.index }));
}

// Expand only a real script tag whose exact URL is in the current manifest.
// The original HTML is never rewritten, and no fictional query versions are
// introduced. This helper is for dependency-presence/order assertions only.
function expandedScriptSources(file) {
  const bundles = Object.values(manifest().bundles);
  return scriptTags(file).flatMap(script => {
    const bundle = bundles.find(candidate => candidate.src === script.src);
    return bundle ? bundle.sources.map(source => './' + source.file) : [script.src.split('?')[0]];
  });
}

function assertCurrentBundle(file, name) {
  const bundle = bundleFor(name);
  const scripts = scriptTags(file).filter(script => script.src === bundle.src);
  assert.equal(scripts.length, 1, `${file} must load the current ${name} hash exactly once`);
  assert.match(scripts[0].tag, /\sdefer(?:\s|>)/);
  assert.doesNotMatch(scripts[0].tag, /\sasync(?:\s|>|=)|\stype\s*=\s*["']module["']/i);
  const contents = fs.readFileSync(path.join(root, bundle.file));
  assert.equal(digest(contents), bundle.sha256, `${name} output hash`);
  assert.equal(bundle.src, `./assets/runtime/${name}.${bundle.sha256.slice(0, 12)}.js`);
  for (const source of bundle.sources) {
    assert.equal(digest(normalizeSource(read(source.file))), source.sha256, `${source.file} is in the current release`);
  }
  return bundle;
}

module.exports = { scriptTags, expandedScriptSources, bundleFor, assertCurrentBundle };
