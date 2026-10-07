/* Build the three browser runtimes without changing their execution order.
 * No downloads or dependency installation are performed. An existing Terser
 * installation can be supplied with --dependencies /path/to/node_modules.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const OUTPUT = 'assets/runtime';
const ENTRIES = ['expedition.html', 'field-frame.html', 'globe-frame.html'];
// Explicit lists remain authoritative after the HTML starts using the bundles.
// The compatibility client and the shared Three.js dependency stay independent.
const SOURCE_GROUPS = Object.freeze({
  app: Object.freeze([
    'js/expedition-dependencies.js',
    'js/expedition-data.js',
    'js/telemetry-access.js',
    'js/expedition-charts.js',
    'js/expedition-atmosphere.js',
    'js/expedition-specular.js',
    'js/expedition-icons.js',
    'js/expedition-actions.js',
    'js/expedition-view.js',
    'js/expedition-app.js'
  ]),
  field: Object.freeze([
    'js/render-budget.js',
    'js/scene-touch.js',
    'js/polar-power.js',
    'js/polar-mast.js',
    'js/polar-snow.js',
    'js/polar-batch.js',
    'js/polar-environment.js',
    'js/polar-camera.js',
    'js/polar-scene.js',
    'js/field-frame.js'
  ]),
  earth: Object.freeze([
    'js/render-budget.js',
    'js/scene-touch.js',
    'js/earth-network.js',
    'js/earth-surface.js',
    'js/expedition-globe.js'
  ])
});

const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const normalizeSource = text => text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');

function findMinifier(dependencies) {
  const request = dependencies ? path.join(path.resolve(dependencies), 'terser') : 'terser';
  let resolved;
  try { resolved = require.resolve(request); }
  catch (error) {
    if (error.code === 'MODULE_NOT_FOUND') return null;
    throw error;
  }
  const terser = require(resolved);
  const packageFile = require.resolve(dependencies ? path.join(path.resolve(dependencies), 'terser/package.json') : 'terser/package.json');
  return { name: 'terser', version: JSON.parse(fs.readFileSync(packageFile, 'utf8')).version, minify: terser.minify };
}

function sameFile(file, expected) {
  try { return fs.readFileSync(file).equals(expected); }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}

function entryOutputs(rootDir, manifest) {
  const outputs = [];
  for (const file of ENTRIES) {
    let html;
    try { html = fs.readFileSync(path.join(rootDir, file), 'utf8'); }
    catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    for (const [name, bundle] of Object.entries(manifest.bundles)) {
      const start = `<!-- runtime:${name} -->`, end = `<!-- /runtime:${name} -->`;
      const starts = html.split(start).length - 1, ends = html.split(end).length - 1;
      if (!starts && !ends) continue;
      if (starts !== 1 || ends !== 1 || html.indexOf(start) > html.indexOf(end)) {
        throw new Error(`Invalid runtime:${name} markers in ${file}; expected one ordered pair.`);
      }
      const first = html.indexOf(start) + start.length, last = html.indexOf(end);
      const block = html.slice(first, last);
      if (!/^\s*<script\b[^>]*>\s*<\/script>\s*$/i.test(block) || !/<script\b[^>]*\sdefer(?:\s|>)/i.test(block)) {
        throw new Error(`Invalid runtime:${name} block in ${file}; expected one empty deferred script.`);
      }
      const src = /(\ssrc\s*=\s*)(["'])([^"']*)\2/i;
      if (!src.test(block)) throw new Error(`Missing runtime:${name} script src in ${file}.`);
      const updated = block.replace(src, (_match, prefix, quote) => `${prefix}${quote}${bundle.src}${quote}`);
      html = html.slice(0, first) + updated + html.slice(last);
    }
    // Only explicitly marked preload lines are managed. Keep their surrounding
    // JS and quotes untouched, including preload(url, 'script') arguments.
    html = html.replace(/^([^\r\n]*?)(\/\/[ \t]*runtime-preload:(app|field|earth)[ \t]*)(\r?)$/gm,
      (_line, code, marker, name, carriageReturn) => {
        const url = new RegExp(`(["'])\\./assets/runtime/${name}\\.[^"']+\\.js\\1`, 'g');
        if ([...code.matchAll(url)].length !== 1) {
          throw new Error(`Invalid runtime-preload:${name} in ${file}; expected one quoted runtime URL.`);
        }
        return code.replace(url, (_match, quote) => `${quote}${manifest.bundles[name].src}${quote}`) + marker + carriageReturn;
      });
    outputs.push({ file, contents: Buffer.from(html, 'utf8') });
  }
  return outputs;
}

async function buildRuntimeBundles({ rootDir = ROOT, dependencies, check = false, minify = true } = {}) {
  rootDir = path.resolve(rootDir);
  const manifestPath = path.join(rootDir, OUTPUT, 'manifest.json');
  let previous;
  if (check) {
    try { previous = JSON.parse(fs.readFileSync(manifestPath, 'utf8')); }
    catch (error) {
      if (error.code === 'ENOENT') throw new Error('Runtime manifest is missing. Run node scripts/build-runtime-bundles.cjs.');
      throw error;
    }
  }
  // Checking an unminified release does not depend on newly installed packages.
  const useMinifier = minify && (!check || previous.minifier?.name !== 'none');
  const minifier = useMinifier ? findMinifier(dependencies) : null;
  if (check && previous.minifier?.name === 'terser' && !minifier) {
    throw new Error('Checking this release requires its existing Terser installation. Pass --dependencies /path/to/node_modules.');
  }
  const manifest = {
    formatVersion: 1,
    generator: 'scripts/build-runtime-bundles.cjs',
    sourceNormalization: 'UTF-8 without BOM; CRLF and CR normalized to LF before hashing',
    minifier: minifier ? { name: minifier.name, version: minifier.version } : { name: 'none' },
    bundles: {}
  };
  const outputs = [];
  for (const [name, files] of Object.entries(SOURCE_GROUPS)) {
    const sources = [];
    const chunks = [`/*! DMS ${name} runtime. Generated by scripts/build-runtime-bundles.cjs; edit the original js/ sources. */\n`];
    for (const file of files) {
      const source = normalizeSource(fs.readFileSync(path.join(rootDir, file), 'utf8'));
      sources.push({ file, sha256: sha256(source), bytes: Buffer.byteLength(source) });
      let code = source;
      if (minifier) {
        // Keep all original comments, bindings and logic. Only compact syntax;
        // optimizing or mangling independent scripts can change public APIs.
        const result = await minifier.minify({ [file]: source }, {
          compress: false, mangle: false, module: false,
          format: { comments: 'all', semicolons: true }
        });
        if (typeof result.code !== 'string') throw new Error(`Terser did not produce code for ${file}`);
        code = normalizeSource(result.code);
      }
      // Newline ends a trailing // comment; semicolon prevents adjacent IIFEs
      // from being interpreted as a call on the preceding script's result.
      chunks.push(`\n;\n/* Source: ${file} */\n${code.trimEnd()}\n`);
    }
    const contents = Buffer.from(chunks.join('') + '\n;\n', 'utf8');
    new vm.Script(contents.toString('utf8'), { filename: `${name}.js` });
    const digest = sha256(contents);
    const file = `${OUTPUT}/${name}.${digest.slice(0, 12)}.js`;
    const url = `./${file}`;
    manifest.bundles[name] = {
      file, src: url, url, sha256: digest, bytes: contents.length,
      gzipBytes: zlib.gzipSync(contents, { level: 9 }).length, sources
    };
    outputs.push({ file, contents });
  }
  outputs.push({ file: `${OUTPUT}/manifest.json`, contents: Buffer.from(JSON.stringify(manifest, null, 2) + '\n') });
  // Pages without markers are deliberately untouched. Marked entry URLs and
  // head preloads follow every rebuild so a new hash cannot stay disconnected.
  outputs.push(...entryOutputs(rootDir, manifest));
  if (check) {
    const stale = outputs.filter(output => !sameFile(path.join(rootDir, output.file), output.contents));
    if (stale.length) throw new Error(`Runtime bundles are stale or damaged: ${stale.map(output => output.file).join(', ')}. Run node scripts/build-runtime-bundles.cjs.`);
  } else {
    fs.mkdirSync(path.join(rootDir, OUTPUT), { recursive: true });
    // Never delete old hashes: already-open pages may still request them.
    // Write bundles first so the manifest can only refer to complete files.
    for (const output of outputs) {
      const target = path.join(rootDir, output.file);
      if (!sameFile(target, output.contents)) fs.writeFileSync(target, output.contents);
    }
  }
  return manifest;
}

function parseArgs(args) {
  const options = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--check') options.check = true;
    else if (args[i] === '--no-minify') options.minify = false;
    else if (args[i] === '--dependencies') {
      if (!args[i + 1] || args[i + 1].startsWith('--')) throw new Error('--dependencies requires an existing node_modules directory.');
      options.dependencies = args[++i];
    } else throw new Error(`Unknown option: ${args[i]}`);
  }
  return options;
}

module.exports = { SOURCE_GROUPS, buildRuntimeBundles, normalizeSource, parseArgs };
if (require.main === module) {
  (async () => {
    const options = parseArgs(process.argv.slice(2));
    const manifest = await buildRuntimeBundles(options);
    console.log(`${options.check ? 'Verified' : 'Built'} runtime bundles (${manifest.minifier.name}).`);
    for (const [name, bundle] of Object.entries(manifest.bundles)) {
      console.log(`${name}: ${bundle.src} | ${bundle.sources.length} scripts | ${bundle.bytes} bytes | ${bundle.gzipBytes} gzip bytes`);
    }
  })().catch(error => { console.error(error.message); process.exitCode = 1; });
}
