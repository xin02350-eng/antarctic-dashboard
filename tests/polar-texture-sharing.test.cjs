'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const T = require('../assets/three.min.js');
const environment = require('../js/polar-environment.js');

function harness(options = {}) {
  const requests = [], statuses = [], reflections = [], timers = new Map();
  const scene = new T.Scene(), accumulation = options.accumulation === false ? null : new T.MeshStandardMaterial();
  let next = 0;
  const mock = { ...T, REVISION: 'revision' in options ? options.revision : T.REVISION,
    TextureLoader: class { load(url, success, _progress, error) {
      const texture = new T.Texture({ width: 1254, height: 1254, url });
      requests.push({ url, texture, error, succeed() { texture.needsUpdate = true; success(texture); }, success });
      return texture;
    } },
    PMREMGenerator: class {
      fromEquirectangular(input) {
        const target = { input, texture: new T.Texture(), releases: 0, dispose() { this.releases++; } };
        reflections.push(target); return target;
      }
      dispose() {}
    }
  };
  const api = environment.create(mock, { capabilities: { getMaxAnisotropy: () => options.anisotropy ?? 16 } }, scene,
    state => statuses.push(state), accumulation, {
      quality: { tier: 'balanced', terrainSegments: 64 },
      setTimeout(callback, delay) { const id = ++next; timers.set(id, { callback, delay }); return id; },
      clearTimeout(id) { timers.delete(id); }
    });
  api.prepare();
  const sky = api.group.getObjectByName('original-polar-panorama').material;
  const snow = api.group.getObjectByName('displaced-sastrugi-foreground').material;
  const apron = api.group.getObjectByName('distant-snow-transition').material;
  function request(name, extension = 'webp') {
    const result = requests.find(item => item.url.endsWith('/' + name + '.' + extension));
    assert.ok(result, name + '.' + extension + ' was requested'); return result;
  }
  function finish(extension = 'webp') {
    for (const name of ['antarctic-glacier-storm-v4', 'compacted-snow-crust-v2', 'wind-carved-snow-v1']) {
      if (name === 'compacted-snow-crust-v2' && !accumulation) continue;
      request(name, extension).succeed();
    }
    api.afterFrame();
  }
  function sourceTextures() {
    return new Set([sky.map, snow.map, snow.bumpMap, apron.map, apron.bumpMap,
      accumulation?.map, accumulation?.bumpMap].filter(Boolean));
  }
  return { api, scene, accumulation, sky, snow, apron, requests, request, finish,
    statuses, reflections, timers, sourceTextures };
}

function assertDetailConfiguration(texture, repeat, anisotropy = 8) {
  assert.deepEqual(texture.repeat.toArray(), repeat);
  assert.equal(texture.wrapS, T.RepeatWrapping); assert.equal(texture.wrapT, T.RepeatWrapping);
  assert.equal(texture.anisotropy, anisotropy);
  assert.equal(texture.minFilter, T.LinearMipmapLinearFilter); assert.equal(texture.magFilter, T.LinearFilter);
  assert.equal(texture.generateMipmaps, true); assert.equal(texture.flipY, true);
  assert.equal(texture.premultiplyAlpha, false); assert.equal(texture.unpackAlignment, 4);
  assert.equal(texture.format, T.RGBAFormat); assert.equal(texture.type, T.UnsignedByteType);
  assert.deepEqual(texture.offset.toArray(), [0, 0]); assert.equal(texture.rotation, 0);
}

test('r128 polar color and bump reuse exactly three unchanged source texture objects', () => {
  const h = harness(); h.finish();
  assert.equal(h.requests.length, 3); assert.equal(h.sourceTextures().size, 3,
    'sky, snow and crust each own one GPU-source Texture rather than five');
  assert.equal(h.snow.map, h.snow.bumpMap);
  assert.equal(h.apron.map, h.snow.map); assert.equal(h.apron.bumpMap, h.snow.map);
  assert.equal(h.accumulation.map, h.accumulation.bumpMap);
  assert.notEqual(h.snow.map, h.accumulation.map);
  assert.equal(h.sky.map, h.request('antarctic-glacier-storm-v4').texture);
  assert.equal(h.snow.map, h.request('wind-carved-snow-v1').texture);
  assert.equal(h.accumulation.map, h.request('compacted-snow-crust-v2').texture);
  assertDetailConfiguration(h.snow.map, [23, 31]);
  assertDetailConfiguration(h.accumulation.map, [2.5, 2.5]);
  for (const material of [h.snow, h.apron, h.accumulation]) {
    assert.equal(material.map.encoding, T.sRGBEncoding, 'color decoding remains enabled');
    assert.equal(material.bumpScale, .035);
    assert.ok(material.map.version > 0);
  }
  assert.equal(h.sky.map.encoding, T.sRGBEncoding);
  assert.equal(h.sky.map.wrapS, T.MirroredRepeatWrapping);
  assert.equal(h.sky.map.wrapT, T.ClampToEdgeWrapping);
  assert.equal(h.sky.map.flipY, true);
  assert.deepEqual(h.sky.map.repeat.toArray(), [1, 1]);
  assert.equal(h.sky.map.minFilter, T.LinearMipmapLinearFilter);
  assert.equal(h.sky.map.magFilter, T.LinearFilter);
  assert.equal(h.api.presentationReady(), true); assert.equal(h.api.degraded(), false);
  assert.deepEqual(h.statuses.at(-1), { panorama: 'ready', snow: 'ready', crust: 'ready' });
  assert.equal(h.timers.size, 0);
});

test('texture sharing keeps the existing hardware anisotropy bound and optional accumulation path', () => {
  for (const maximum of [1, 4, 16]) {
    const h = harness({ anisotropy: maximum }); h.finish();
    assertDetailConfiguration(h.snow.map, [23, 31], Math.min(8, maximum));
    assertDetailConfiguration(h.accumulation.map, [2.5, 2.5], Math.min(8, maximum));
  }
  const h = harness({ accumulation: false }); h.finish();
  assert.equal(h.requests.length, 2); assert.equal(h.sourceTextures().size, 2);
  assert.equal(h.snow.map, h.snow.bumpMap); assert.equal(h.api.presentationReady(), true);
});

test('original PNG recovery retains the same shared maps and full texture settings', () => {
  const h = harness();
  for (const request of [...h.requests]) { request.error(); request.error(); }
  assert.equal(h.requests.length, 6, 'each actual WebP error starts one original-format fallback');
  h.finish('png');
  assert.equal(h.sourceTextures().size, 3);
  for (const texture of h.sourceTextures()) assert.match(texture.image.url, /\.png$/);
  assert.equal(h.snow.map, h.snow.bumpMap); assert.equal(h.accumulation.map, h.accumulation.bumpMap);
  assertDetailConfiguration(h.snow.map, [23, 31]);
  assertDetailConfiguration(h.accumulation.map, [2.5, 2.5]);
  assert.equal(h.api.degraded(), false); assert.equal(h.api.presentationReady(), true);
  assert.equal(h.timers.size, 0);
});

test('context restoration rebuilds only the reflection target and retains shared source maps', () => {
  const h = harness(); h.finish();
  const textures = [...h.sourceTextures()], versions = textures.map(texture => texture.version);
  const refs = [h.sky.map, h.snow.map, h.snow.bumpMap, h.apron.map, h.apron.bumpMap,
    h.accumulation.map, h.accumulation.bumpMap];
  h.api.restore(); h.api.restore();
  assert.equal(h.reflections.length, 3);
  assert.deepEqual(h.reflections.map(target => target.releases), [1, 1, 0]);
  assert.ok(h.reflections.every(target => target.input === h.sky.map));
  assert.equal(h.scene.environment, h.reflections.at(-1).texture);
  assert.deepEqual([...h.sourceTextures()], textures);
  assert.deepEqual(textures.map(texture => texture.version), versions);
  assert.deepEqual([h.sky.map, h.snow.map, h.snow.bumpMap, h.apron.map, h.apron.bumpMap,
    h.accumulation.map, h.accumulation.bumpMap], refs);
  assert.equal(h.requests.length, 3); assert.equal(h.api.presentationReady(), true);
});

test('unknown Three revisions keep independent linear bump clones instead of assuming upload equivalence', () => {
  for (const revision of ['129', '200', undefined, 128]) {
    const h = harness({ revision }); h.finish();
    assert.equal(h.sourceTextures().size, 5, 'only exact pinned revision string 128 can share');
    for (const material of [h.snow, h.accumulation]) {
      assert.notEqual(material.map, material.bumpMap);
      assert.equal(material.map.image, material.bumpMap.image, 'fallback still uses the same unchanged pixels');
      assert.equal(material.map.encoding, T.sRGBEncoding); assert.equal(material.bumpMap.encoding, T.LinearEncoding);
      assertDetailConfiguration(material.bumpMap, material === h.snow ? [23, 31] : [2.5, 2.5]);
      assert.ok(material.bumpMap.version > 0); assert.equal(material.bumpScale, .035);
    }
    assert.equal(h.apron.map, h.snow.map); assert.equal(h.apron.bumpMap, h.snow.bumpMap);
  }
});

test('pinned r128 shader contract decodes only color and samples bump as raw red', () => {
  assert.equal(T.REVISION, '128', 'upgrading Three requires reviewing hardware sRGB upload before enabling sharing');
  assert.match(T.ShaderChunk.map_fragment, /mapTexelToLinear\s*\(\s*texelColor\s*\)/);
  const bump = T.ShaderChunk.bumpmap_pars_fragment;
  assert.equal((bump.match(/texture2D\(\s*bumpMap\s*,[^;]+\)\.x/g) || []).length, 3);
  assert.doesNotMatch(bump, /TexelToLinear|sRGB|encoding|decode|pow\(/i);
  // In this fixed local renderer, internal format depends only on explicit
  // internalFormat, channel format and type. The r128 RGBA unsigned-byte path
  // selects RGBA8 (32856), not SRGB8_ALPHA8 (35907), before shader decoding.
  const library = fs.readFileSync(path.join(__dirname, '../assets/three.min.js'), 'utf8');
  const formatFunction = library.match(/function O\(n,i,r\)\{([\s\S]+?)\}function H\(/)?.[1];
  assert.ok(formatFunction, 'recheck the local r128 internal-format implementation if the bundle changes');
  assert.match(formatFunction, /6408===i/); assert.match(formatFunction, /5121===r&&\(s=32856\)/);
  assert.doesNotMatch(formatFunction, /encoding|35907|35905|SRGB/);
});
