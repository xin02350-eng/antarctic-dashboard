const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../assets/three.min.js');
const createPower = require('../js/polar-power.js');
const createMast = require('../js/polar-mast.js');
const environment = require('../js/polar-environment.js');
const fs = require('node:fs');
const path = require('node:path');
function create() {
  const m = Object.fromEntries(['silver', 'dark', 'white', 'frost', 'cell', 'trace', 'rubber', 'blade', 'orange', 'glow', 'decal'].map(name => [name, new T.MeshStandardMaterial()]));
  return createMast(T, m, createPower, environment.heightAt);
}
test('one continuous structural mast with coaxial PV and sealed upper end', () => {
  const model = create(); model.group.updateMatrixWorld(true);
  let axes = 0; model.group.traverse(object => { if (object.name === 'main-structural-mast') axes++; });
  assert.equal(axes, 1); assert.equal(model.group.userData.mainAxisCount, 1);
  const bounds = new T.Box3().setFromObject(model.mast);
  assert.ok(bounds.min.y < 0 && bounds.max.y > 5.5, 'main shaft runs from beneath the ice to the upper sensors');
  assert.ok(model.group.getObjectByName('sealed-mast-cap'));
  for (const object of [model.mast, model.power.solar]) {
    const center = object.getWorldPosition(new T.Vector3());
    assert.equal(center.x, 0); assert.equal(center.z, 0);
  }
});
test('wind-speed sensor and communication antenna remain above the photovoltaic prism', () => {
  const model = create(); model.group.updateMatrixWorld(true);
  const solar = new T.Box3().setFromObject(model.power.solar), cups = new T.Box3().setFromObject(model.cups);
  assert.ok(cups.min.y > solar.max.y + 0.5);
  assert.ok(Math.hypot(model.anchors.antenna.x, model.anchors.antenna.z) > 0.9);
  assert.equal(model.cups.name, 'wind-speed-sensor');
  assert.equal(model.power.group.userData.windGeneratorCount, 0);
});
test('rectangular four-sided enclosure encircles the shaft with a real central bore', () => {
  const model = create(); model.group.updateMatrixWorld(true);
  assert.equal(model.enclosure.userData.sides, 4);
  assert.equal(model.enclosure.userData.width, 1.96);
  assert.equal(model.enclosure.userData.depth, 1.62);
  assert.equal(model.enclosure.position.x, 0); assert.equal(model.enclosure.position.z, 0);
  const body = model.group.getObjectByName('rectangular-enclosure-body');
  const bounds = new T.Box3().setFromObject(body);
  assert.ok(Math.abs(bounds.max.x - bounds.min.x - 1.976) < .001);
  assert.ok(Math.abs(bounds.max.z - bounds.min.z - 1.636) < .001);
  assert.ok(bounds.max.y - bounds.min.y > 1.1);
  const ray = new T.Raycaster(new T.Vector3(0, 0.7, 0), new T.Vector3(0, 1, 0));
  assert.equal(ray.intersectObject(body).length, 0, 'central hole must not be capped');
  ray.ray.origin.x = 0.3;
  assert.ok(ray.intersectObject(body).length > 0, 'material surrounds the central hole');
});
test('four outward-sloping roof faces have thickness and clear all three PV lower supports', () => {
  const model = create(); model.group.updateMatrixWorld(true);
  const spec = model.roof.userData;
  assert.ok(spec.peakY - spec.eaveY > 0.35);
  assert.equal(spec.sides, 4);
  assert.ok(spec.width > model.enclosure.userData.width && spec.depth > model.enclosure.userData.depth, 'eaves overhang every wall');
  const normal = model.roof.geometry.attributes.normal;
  for (let face = 0; face < 4; face++) {
    const ny = normal.getY(face * 24);
    assert.ok(ny > 0.5 && ny < 0.95, 'roof top normals point upward at a clear slope');
  }
  const boot = new T.Box3().setFromObject(model.group.getObjectByName('roof-mast-weather-boot'));
  const bootMesh = model.group.getObjectByName('roof-mast-weather-boot'), bootSpec = bootMesh.geometry.parameters;
  const ratio = (bootMesh.position.y + bootSpec.height / 2 - spec.peakY) / bootSpec.height;
  const radiusAtRoof = bootSpec.radiusTop + (bootSpec.radiusBottom - bootSpec.radiusTop) * ratio;
  assert.ok(spec.innerCorners.every(point => Math.hypot(point[0], point[2]) < radiusAtRoof), 'weather boot seals every corner of the mast opening');
  let supports = 0;
  model.power.solar.traverse(object => {
    if (object.name !== 'pv-lower-support') return;
    supports++;
    assert.ok(new T.Box3().setFromObject(object).min.y > boot.max.y + 0.02, 'PV braces clear roof and central weather boot');
  });
  assert.equal(supports, 3);
});

test('four outward-facing marks share resources and print flush to the cabinet with no separate plate', () => {
  const model = create(); model.group.updateMatrixWorld(true);
  const labels = [];
  model.enclosure.traverse(object => { if (object.name.startsWith('hanyu-zhice-brand-face-')) labels.push(object); });
  assert.equal(labels.length, 4);
  assert.equal(new Set(labels.map(label => label.material)).size, 1);
  assert.equal(new Set(labels.map(label => label.geometry)).size, 1);
  const directions = [];
  for (const label of labels) {
    assert.equal(label.userData.brand, '寒域智测');
    assert.ok(label.position.z > .029 && label.position.z < .032, 'ink clears the service door without floating above it');
    assert.equal(label.castShadow, false, 'printed ink cannot cast a rectangular plate shadow');
    assert.equal(label.receiveShadow, true);
    assert.equal(label.userData.finish, 'direct-print');
    assert.equal(label.parent.children.some(child => child.name.startsWith('brand-plate-rim-')), false);
    const position = label.getWorldPosition(new T.Vector3());
    const normal = new T.Vector3(0, 0, 1).transformDirection(label.matrixWorld);
    assert.ok(normal.dot(new T.Vector3(position.x, 0, position.z)) > .8, 'text faces outward, not through the cabinet');
    directions.push(normal);
    assert.ok(label.geometry.parameters.width < label.parent.userData.panelWidth - .2);
  }
  for (let i = 0; i < 4; i++) assert.ok(Math.abs(directions[i].dot(directions[(i + 1) % 4])) < 1e-6);
  assert.equal(model.power.panels.length, 3, 'solar assembly still has exactly three faces');
});
test('all single-mast geometry and normals remain finite within a browser-friendly budget', () => {
  const model = create(); let triangles = 0;
  model.group.traverse(object => {
    if (!object.isMesh) return;
    assert.ok(Array.from(object.geometry.attributes.position.array).every(Number.isFinite));
    assert.ok(Array.from(object.geometry.attributes.normal.array).every(Number.isFinite));
    triangles += (object.geometry.index ? object.geometry.index.count : object.geometry.attributes.position.count) / 3 * (object.count || 1);
  });
  assert.ok(triangles < 80000, `station triangles: ${triangles}`);
});
test('terrain is deterministic, finite, locally grounded, and not a flat display stage', () => {
  assert.equal(environment.heightAt(0, 0), -0.055);
  const heights = [];
  for (let x = -100; x <= 100; x += 2.7) for (let z = -100; z <= 100; z += 3.7) {
    const height = environment.heightAt(x, z); assert.ok(Number.isFinite(height)); assert.equal(height, environment.heightAt(x, z)); heights.push(height);
  }
  assert.ok(Math.max(...heights) - Math.min(...heights) > 0.7);
  assert.ok(Math.max(...heights) < 2 && Math.min(...heights) > -2);
});
test('foundation intersects the actual terrain instead of hovering above it', () => {
  const model = create(); model.group.updateMatrixWorld(true);
  const bounds = new T.Box3().setFromObject(model.group.getObjectByName('single-foundation-flange'));
  assert.ok(bounds.min.y < environment.heightAt(0, 0));
  assert.ok(bounds.max.y > environment.heightAt(0, 0));
  for (let a = 0; a < Math.PI * 2; a += 0.2) {
    const y = environment.heightAt(Math.cos(a) * 0.38, Math.sin(a) * 0.38);
    assert.ok(y > bounds.min.y && y < bounds.max.y);
  }
});
test('all view angles retain the same opaque depth-writing ground and real shadows', () => {
  const mockT = Object.assign({}, T, { TextureLoader: class { load() {} } });
  const scene = new T.Scene(), env = environment.create(mockT, {}, scene);
  const ground = env.group.getObjectByName('displaced-sastrugi-foreground');
  const camera = new T.PerspectiveCamera(36, 1, 0.1, 600);
  for (const elevation of [0.03, 0.10, 0.19, 0.86, 1.20]) {
    camera.position.set(12, 3.85 + Math.sin(elevation) * 22.8, Math.cos(elevation) * 22.8);
    camera.lookAt(0, 3.85, 0); env.update(10, camera);
    assert.equal(ground.visible, true); assert.equal(ground.material.transparent, false);
    assert.equal(ground.material.opacity, 1); assert.equal(ground.material.depthWrite, true);
    assert.equal(ground.receiveShadow, true);
  }
  ground.updateMatrixWorld(true);
  const ray = new T.Raycaster(new T.Vector3(0, 1, 0), new T.Vector3(0, -1, 0));
  assert.ok(Math.abs(ray.intersectObject(ground)[0].point.y - environment.heightAt(0, 0)) < 0.001);
  assert.equal(env.group.getObjectByName('terrain-contact-shadow'), undefined);
  const apron = env.group.getObjectByName('distant-snow-transition');
  const p = apron.geometry.attributes.position;
  for (const index of apron.geometry.index.array) {
    assert.ok(Math.hypot(p.getX(index), p.getZ(index)) > 33, 'fading apron must not extend beneath the device or orbit camera');
  }
  const plumes = env.group.getObjectByName('layered-blowing-snow');
  assert.equal(plumes.children.length, 3);
  assert.ok(plumes.children.every(plume => plume.material.uniforms.time.value === 10));
  env.update(10, camera);
  assert.ok(plumes.children.every(plume => plume.material.uniforms.time.value === 10), 'paused scene time freezes every plume');
});
test('published environment assets are actual local PNGs with bounded download and texture sizes', () => {
  for (const filename of ['wind-carved-snow-v1.png', 'compacted-snow-crust-v2.png', 'antarctic-glacier-storm-v4.png']) {
    const bytes = fs.readFileSync(path.join(__dirname, '../assets/polar', filename));
    assert.equal(bytes.subarray(1, 4).toString(), 'PNG');
    const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
    assert.ok(width >= 1000 && height >= 700); assert.ok(width <= 4096 && height <= 4096);
    assert.ok(bytes.length < 4 * 1024 * 1024);
  }
});

test('supplied project logo stays local, compact and traceable to the PPT artwork', () => {
  const manifest = require('../assets/polar/hanyu-zhice-brand-v1.manifest.json');
  const logo = fs.readFileSync(path.join(__dirname, '../assets/polar', manifest.asset));
  assert.equal(logo.subarray(0, 4).toString(), 'RIFF');
  assert.equal(logo.subarray(8, 12).toString(), 'WEBP');
  assert.equal(logo.length, manifest.bytes); assert.ok(logo.length < 64 * 1024);
  assert.equal(require('node:crypto').createHash('sha256').update(logo).digest('hex'), manifest.assetSha256);
  assert.equal(manifest.packagePart, 'ppt/media/image2.png');
  assert.equal(manifest.width, manifest.height);
  assert.ok(fs.existsSync(path.join(__dirname, '../assets/polar', manifest.asset)));
});
