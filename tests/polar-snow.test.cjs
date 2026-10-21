const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../assets/three.min.js');
const createMast = require('../js/polar-mast.js');
const createPower = require('../js/polar-power.js');
const createSnow = require('../js/polar-snow.js');
function create() {
  const material = new T.MeshStandardMaterial();
  const materials = Object.fromEntries(['silver', 'dark', 'white', 'frost', 'cell', 'trace', 'rubber', 'blade', 'orange', 'glow'].map(key => [key, material]));
  const model = createMast(T, materials, createPower);
  const snow = createSnow(T, model, material); model.group.updateMatrixWorld(true);
  return { model, snow };
}
test('snow follows all four rectangular roof faces while keeping all three PV frames', () => {
  const { model, snow } = create();
  assert.equal(model.roof.userData.sides, 4);
  assert.equal(snow.patches.length, 14);
  assert.equal(snow.group.userData.depositCount, 14);
  for (let side = 0; side < 4; side++) {
    assert.ok(snow.group.getObjectByName(`roof-snow-${side}`));
  }
  for (let side = 0; side < 3; side++) {
    assert.ok(model.power.panels[side].getObjectByName(`pv-frame-snow-${side}`));
    assert.ok(model.power.panels[side].getObjectByName(`pv-lower-lip-snow-${side}`));
  }
  assert.equal(model.power.group.userData.windGeneratorCount, 0);
});

test('roof deposits sit on their real pitched surface, stay inside its eaves and leave the mast opening clear', () => {
  const { model, snow } = create();
  const roof = model.roof.userData;
  assert.equal(roof.outerCorners.length, 4);
  assert.equal(roof.innerCorners.length, 4);
  const ray = new T.Raycaster(new T.Vector3(), new T.Vector3(0, -1, 0));
  const position = new T.Vector3();
  for (let side = 0; side < 4; side++) {
    const patch = snow.group.getObjectByName(`roof-snow-${side}`);
    const vertices = patch.geometry.attributes.position, layerSize = vertices.count / 2;
    const corners = [roof.outerCorners[side], roof.outerCorners[(side + 1) % 4],
      roof.innerCorners[side], roof.innerCorners[(side + 1) % 4]];
    for (let i = 0; i < vertices.count; i++) {
      position.fromBufferAttribute(vertices, i);
      for (const axis of ['x', 'z']) {
        const coordinate = axis === 'x' ? 0 : 2;
        assert.ok(position[axis] >= Math.min(...corners.map(point => point[coordinate])) - 1e-6);
        assert.ok(position[axis] <= Math.max(...corners.map(point => point[coordinate])) + 1e-6);
      }
      ray.ray.origin.set(position.x, roof.peakY + 1, position.z);
      const hit = ray.intersectObject(model.roof)[0];
      assert.ok(hit, `${patch.name}: every snow vertex must project onto a real roof surface`);
      const height = position.y - hit.point.y;
      if (i < layerSize) assert.ok(height >= .003 - 1e-6 && height < .15, 'snow rests just above its roof');
      else assert.ok(Math.abs(height + .003) < 1e-6, 'closed underside only penetrates the roof by its seating allowance');
    }
  }
  ray.ray.origin.set(0, roof.peakY + 1, 0);
  assert.equal(ray.intersectObjects(snow.patches.filter(patch => patch.name.startsWith('roof-snow'))).length, 0);
});

test('roof metadata is not mutated and legacy triangular roofs retain their exact snow count and budget', () => {
  const material = new T.MeshStandardMaterial();
  const { model } = create();
  const metadata = JSON.stringify(model.roof.userData);
  createSnow(T, model, material);
  assert.equal(JSON.stringify(model.roof.userData), metadata);
  model.roof.userData = { outerRadius: 1.18, innerRadius: .32, eaveY: 1.98, peakY: 2.36, thickness: .035 };
  const legacy = createSnow(T, model, material);
  assert.equal(legacy.patches.length, 13);
  assert.equal(legacy.patches.filter(patch => patch.name.startsWith('roof-snow')).length, 3);
  assert.equal(legacy.patches.reduce((sum, patch) => sum + patch.geometry.index.count / 3, 0), 19928);
});
test('snow slabs are closed finite meshes within a bounded geometry budget', () => {
  const { snow } = create(); let triangles = 0;
  for (const patch of snow.patches) {
    const g = patch.geometry;
    assert.ok([...g.attributes.position.array, ...g.attributes.normal.array].every(Number.isFinite));
    triangles += g.index.count / 3;
    const edges = new Map(), ids = g.index.array;
    for (let i = 0; i < ids.length; i += 3) for (let e = 0; e < 3; e++) {
      const a = ids[i + e], b = ids[i + (e + 1) % 3], key = [Math.min(a, b), Math.max(a, b)].join(':');
      edges.set(key, (edges.get(key) || 0) + 1);
    }
    assert.ok([...edges.values()].every(count => count === 2), `${patch.name} must have a sealed underside and edges`);
  }
  assert.ok(triangles < 20000, `snow triangles: ${triangles}`);
});
test('roof snow clears PV supports and frame snow does not fill the solar prism', () => {
  const { model, snow } = create();
  let supportMin = Infinity;
  model.power.solar.traverse(object => {
    if (object.name === 'pv-lower-support') supportMin = Math.min(supportMin, new T.Box3().setFromObject(object).min.y);
  });
  for (const patch of snow.patches.filter(patch => patch.name.startsWith('roof-snow'))) {
    assert.ok(new T.Box3().setFromObject(patch).max.y < supportMin - 0.02);
  }
  for (const panel of model.power.panels) {
    const patch = panel.children.find(object => object.name.startsWith('pv-frame-snow'));
    patch.geometry.computeBoundingBox();
    const b = patch.geometry.boundingBox;
    assert.ok(b.min.y >= panel.userData.height / 2);
    assert.ok(b.max.z - b.min.z < 0.2, 'snow stays on the narrow frame, not across the prism opening');
  }
});
test('crust has material coordinates, shaded edges and exposed gaps between PV deposits', () => {
  const { model, snow } = create();
  for (const patch of snow.patches) {
    const g = patch.geometry;
    assert.equal(g.attributes.uv.count, g.attributes.position.count);
    assert.equal(g.attributes.color.count, g.attributes.position.count);
    assert.ok([...g.attributes.uv.array].every(Number.isFinite));
    assert.ok(Math.max(...g.attributes.color.array) - Math.min(...g.attributes.color.array) > 0.1);
  }
  for (let i = 0; i < 3; i++) {
    const a = model.power.panels[i].getObjectByName(`pv-frame-snow-${i}`);
    const b = model.power.panels[i].getObjectByName(`pv-frame-drift-fragment-${i}`);
    a.geometry.computeBoundingBox(); b.geometry.computeBoundingBox();
    assert.ok(a.geometry.boundingBox.max.x < b.geometry.boundingBox.min.x, 'wind-exposed break must remain between snow patches');
  }
});
