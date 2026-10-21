const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../assets/three.min.js');
const batch = require('../js/polar-batch.js');
const createMast = require('../js/polar-mast.js');
const createPower = require('../js/polar-power.js');
const createSnow = require('../js/polar-snow.js');
const environment = require('../js/polar-environment.js');

function realModel() {
  const materials = Object.fromEntries(['white', 'silver', 'dark', 'rubber', 'orange', 'frost', 'trace', 'cups', 'cell', 'glow', 'decal']
    .map(name => [name, new T.MeshStandardMaterial()]));
  materials.decal.transparent = true; materials.decal.depthWrite = false;
  const model = createMast(T, materials, createPower, environment.heightAt);
  const snowMaterial = new T.MeshStandardMaterial({ vertexColors: true });
  snowMaterial.onBeforeCompile = function(shader) {
    shader.vertexShader = 'varying vec3 snowLocal;\n' + shader.vertexShader;
  };
  const snow = createSnow(T, model, snowMaterial);
  return { model, materials, snow, snowMaterial };
}
function add(root, material, x = 0) {
  const mesh = new T.Mesh(new T.BoxGeometry(1, 2, 3), material);
  mesh.position.x = x; root.add(mesh); return mesh;
}
function closeArrays(actual, expected, tolerance = 1e-6) {
  assert.equal(actual.length, expected.length);
  for (let i = 0; i < actual.length; i++) assert.ok(Math.abs(actual[i] - expected[i]) <= tolerance, `coordinate ${i}`);
}

test('four-sided directly printed station compacts while retaining four thin ink layers', () => {
  const { model, materials, snow } = realModel();
  const beforeBounds = new T.Box3().setFromObject(model.group);
  const cupsParent = model.cups.parent, cupChildren = [...model.cups.children];
  const originalGroups = [model.enclosure, model.power.group, model.power.solar, ...model.power.panels];
  const stats = batch.compact(T, model.group, { exclude: [model.cups] });
  assert.equal(stats.before, 180); assert.equal(stats.after, 39);
  assert.equal(stats.saved, 141); assert.equal(stats.batches, 5);
  assert.equal(stats.trianglesBefore, 33880); assert.equal(stats.trianglesAfter, 33880);
  const afterBounds = new T.Box3().setFromObject(model.group);
  closeArrays(afterBounds.min.toArray(), beforeBounds.min.toArray());
  closeArrays(afterBounds.max.toArray(), beforeBounds.max.toArray());
  assert.equal(model.cups.parent, cupsParent); assert.deepEqual(model.cups.children, cupChildren);
  assert.ok(originalGroups.every(group => model.group.getObjectById(group.id) === group), 'metadata groups and three solar faces remain attached');
  assert.ok(snow.patches.every(patch => model.group.getObjectById(patch.id) === patch), 'object-space snow grain remains unchanged');
  let batchCount = 0;
  model.group.traverse(object => {
    if (!object.name.startsWith('static-material-batch-')) return;
    batchCount++; assert.equal(object.geometry.index, null, 'no Uint32 index support is needed');
    assert.ok(Object.values(materials).includes(object.material), 'materials are shared, never cloned');
    assert.ok(object.userData.sourceNames.length >= 2);
  });
  assert.equal(batchCount, 5);
  let inkCount = 0;
  model.group.traverse(object => { if (object.material === materials.decal) { inkCount++; assert.equal(object.castShadow, false); } });
  assert.equal(inkCount, 4, 'four transparent UV-only marks stay attached to their correct outward faces');
  const second = batch.compact(T, model.group, { exclude: [model.cups] });
  assert.equal(second.before, 39); assert.equal(second.after, 39); assert.equal(second.reason, 'unchanged');
});

test('parent transforms, vertex normals, UVs and normalized colors survive exact attribute baking', () => {
  const scene = new T.Group(), root = new T.Group(), nested = new T.Group(), material = new T.MeshStandardMaterial();
  scene.position.set(10, -2, 4); scene.rotation.y = 0.6; scene.add(root);
  root.rotation.z = 0.3; root.position.y = 2; root.add(nested);
  nested.position.set(1, 2, 3); nested.rotation.x = 0.4; nested.scale.set(2, 0.5, 1.2);
  const a = add(nested, material), b = add(root, material, -3);
  for (const mesh of [a, b]) {
    const color = new Uint8Array(mesh.geometry.attributes.position.count * 3).fill(127);
    mesh.geometry.setAttribute('color', new T.BufferAttribute(color, 3, true));
  }
  scene.updateMatrixWorld(true);
  const inverse = root.matrixWorld.clone().invert(), expected = {};
  for (const mesh of [a, b]) {
    const geometry = mesh.geometry.clone().applyMatrix4(new T.Matrix4().multiplyMatrices(inverse, mesh.matrixWorld)).toNonIndexed();
    for (const [name, attribute] of Object.entries(geometry.attributes)) (expected[name] ||= []).push(...attribute.array);
    geometry.dispose();
  }
  const untouched = [...a.geometry.attributes.position.array];
  const stats = batch.compact(T, root);
  assert.equal(stats.after, 1); assert.equal(stats.trianglesBefore, stats.trianglesAfter);
  const result = root.getObjectByName('static-material-batch-0');
  for (const [name, values] of Object.entries(expected)) closeArrays(result.geometry.attributes[name].array, values);
  assert.equal(result.geometry.attributes.color.normalized, true);
  assert.equal(result.geometry.attributes.color.array.constructor, Uint8Array);
  assert.deepEqual([...a.geometry.attributes.position.array], untouched, 'source buffers were never changed');
  assert.equal(nested.parent, root);
});

test('casts, receive flags, attribute layouts and exact material identity form separate batches', () => {
  const root = new T.Group(), a = new T.MeshStandardMaterial(), b = a.clone();
  const pairs = [];
  for (let group = 0; group < 5; group++) {
    const pair = [add(root, group === 4 ? b : a), add(root, group === 4 ? b : a, 2)];
    for (const mesh of pair) {
      mesh.castShadow = group === 1; mesh.receiveShadow = group === 2;
      if (group === 3) mesh.geometry.deleteAttribute('uv');
    }
    pairs.push(pair);
  }
  const stats = batch.compact(T, root);
  assert.equal(stats.before, 10); assert.equal(stats.after, 5);
  assert.equal(root.children.filter(mesh => mesh.castShadow).length, 1);
  assert.equal(root.children.filter(mesh => mesh.receiveShadow).length, 1);
  assert.equal(root.children.filter(mesh => !mesh.geometry.attributes.uv).length, 1);
  let disposed = false; a.addEventListener('dispose', () => { disposed = true; });
  a.emissiveIntensity = 2.1;
  assert.ok(root.children.filter(mesh => mesh.material === a).every(mesh => mesh.material.emissiveIntensity === 2.1));
  assert.equal(disposed, false);
});

test('animated subtrees stay attached and retain independent rotation', () => {
  const { model } = realModel(), probe = model.cups.children.at(-1);
  const prior = probe.getWorldPosition(new T.Vector3());
  batch.compact(T, model.group, { exclude: [model.cups] });
  model.cups.rotation.y += 0.8; model.group.updateMatrixWorld(true);
  const after = probe.getWorldPosition(new T.Vector3());
  assert.ok(prior.distanceTo(after) > 0.1);
  assert.equal(probe.parent, model.cups);
  assert.equal(model.power.panels.filter(panel => panel.getObjectByName('individual-pv-cells')?.isInstancedMesh).length, 3);
});

test('unsafe mesh variants and hidden subtrees are not modified', () => {
  const root = new T.Group(), material = new T.MeshStandardMaterial();
  const multi = add(root, [material, material]);
  const mirrored = add(root, material); mirrored.scale.x = -1;
  const partial = add(root, material); partial.geometry.setDrawRange(0, 3);
  const morph = add(root, material); morph.geometry.morphAttributes.position = [morph.geometry.attributes.position.clone()];
  const hidden = new T.Group(); hidden.visible = false; root.add(hidden);
  const hiddenMeshes = [add(hidden, material), add(hidden, material)];
  const shader = new T.ShaderMaterial(), custom = [add(root, shader), add(root, shader)];
  const parentMesh = add(root, material); parentMesh.add(new T.Group());
  add(root, material); add(root, material);
  const retained = [multi, mirrored, partial, morph, ...hiddenMeshes, ...custom, parentMesh];
  const parents = retained.map(mesh => mesh.parent);
  const stats = batch.compact(T, root);
  assert.equal(stats.batches, 1);
  assert.ok(retained.every((mesh, index) => mesh.parent === parents[index]));
});

test('a late geometry failure rolls back every staged batch and leaves source meshes untouched', () => {
  const root = new T.Group(), a = new T.MeshStandardMaterial(), b = a.clone();
  const originals = [add(root, a), add(root, a), add(root, b), add(root, b)];
  originals[3].geometry.clone = () => { throw new Error('simulated allocation failure'); };
  let stagedDisposed = 0;
  class TrackedGeometry extends T.BufferGeometry { constructor() { super(); this.addEventListener('dispose', () => { stagedDisposed++; }); } }
  const stats = batch.compact({ ...T, BufferGeometry: TrackedGeometry }, root);
  assert.equal(stats.reason, 'unsupported'); assert.equal(stats.before, stats.after);
  assert.equal(stats.merged, 0); assert.equal(stats.batches, 0); assert.equal(stagedDisposed, 1);
  assert.deepEqual(root.children, originals);
  assert.ok(originals.every(mesh => mesh.parent === root));
});

test('missing capabilities or singular roots safely leave the scene intact', () => {
  assert.equal(batch.compact(null, null).reason, 'unavailable');
  const root = new T.Group(), material = new T.MeshStandardMaterial(), originals = [add(root, material), add(root, material)];
  assert.equal(batch.compact({ ...T, BufferGeometry: null }, root).reason, 'unavailable');
  root.scale.x = 0;
  assert.equal(batch.compact(T, root).reason, 'unsupported');
  assert.deepEqual(root.children, originals);
});
