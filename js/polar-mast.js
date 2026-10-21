/* Single-axis concept station. Dimensions are visual design, not construction drawings. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory;
  else root.createPolarMast = factory;
})(typeof window === 'undefined' ? globalThis : window, function (T, m, createPower, heightAt) {
  'use strict';
  var station = new T.Group(); station.name = 'single-axis-observatory';
  heightAt = heightAt || function () { return -0.055; };
  station.userData = { mainAxisCount: 1, conceptOnly: true };
  function part(geometry, material, parent, x, y, z) {
    var object = new T.Mesh(geometry, material); object.position.set(x || 0, y || 0, z || 0);
    object.castShadow = object.receiveShadow = true; (parent || station).add(object); return object;
  }
  function cylinder(r1, r2, h, material, x, y, z, segments) { return part(new T.CylinderGeometry(r1, r2, h, segments || 32), material, station, x, y, z); }
  function rod(a, b, r, material, parent) {
    var start = new T.Vector3().fromArray(a), end = new T.Vector3().fromArray(b);
    var object = part(new T.CylinderGeometry(r, r, start.distanceTo(end), 12), material, parent || station);
    object.position.copy(start.clone().add(end).multiplyScalar(0.5));
    object.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), end.sub(start).normalize()); return object;
  }
  // One continuous load-bearing mast, embedded in the ice. No four-legged chassis.
  var mast = cylinder(0.105, 0.155, 5.87, m.silver, 0, 2.685, 0); mast.name = 'main-structural-mast';
  cylinder(0.108, 0.108, 0.035, m.dark, 0, 5.638, 0).name = 'sealed-mast-cap';
  cylinder(0.20, 0.20, 0.28, m.dark, 0, 0.16, 0);
  var foundationY = heightAt(0, 0) + 0.030;
  cylinder(0.38, 0.38, 0.085, m.silver, 0, foundationY, 0, 48).name = 'single-foundation-flange';
  cylinder(0.22, 0.28, 0.10, m.white, 0, 0.31, 0);
  for (var i = 0; i < 8; i++) {
    var angle = i / 8 * Math.PI * 2;
    cylinder(0.025, 0.025, 0.045, m.dark, Math.cos(angle) * 0.3, foundationY + 0.062, Math.sin(angle) * 0.3, 6);
  }
  [0.65, 1.2, 2.25, 2.39, 4.35, 5.15].forEach(function (y) {
    cylinder(0.17, 0.17, 0.065, m.dark, 0, y, 0);
    cylinder(0.18, 0.18, 0.015, m.silver, 0, y + 0.04, 0);
  });
  cylinder(0.159, 0.159, 0.20, m.orange, 0, 0.8, 0);
  // Four-sided equipment cabinet around the same continuous mast. The PV prism above stays triangular.
  var enclosure = new T.Group(); enclosure.name = 'coaxial-rectangular-equipment-enclosure'; station.add(enclosure);
  var bodyWidth = 1.96, bodyDepth = 1.62, bodyBottom = 0.82, bodyTop = 1.96, roofPeak = 2.36;
  enclosure.userData = { sides: 4, width: bodyWidth, depth: bodyDepth, bottom: bodyBottom, top: bodyTop, boreRadius: 0.19 };
  function rectanglePoint(width, depth, index, y) {
    var corner = ((index % 4) + 4) % 4;
    return new T.Vector3((corner === 0 || corner === 3 ? 1 : -1) * width / 2, y, (corner < 2 ? 1 : -1) * depth / 2);
  }
  function cabinet(width, depth, bottom, height, material) {
    var shape = new T.Shape();
    for (var j = 0; j < 4; j++) {
      var p = rectanglePoint(width, depth, j, 0);
      if (j === 0) shape.moveTo(p.x, -p.z); else shape.lineTo(p.x, -p.z);
    }
    shape.closePath();
    var bore = new T.Path(); bore.absarc(0, 0, 0.19, 0, Math.PI * 2, true); shape.holes.push(bore);
    var geometry = new T.ExtrudeGeometry(shape, { depth: height, bevelEnabled: true, bevelSize: 0.008, bevelThickness: 0.008, bevelSegments: 2, steps: 1, curveSegments: 24 });
    geometry.rotateX(-Math.PI / 2);
    return part(geometry, material, enclosure, 0, bottom, 0);
  }
  cabinet(bodyWidth, bodyDepth, bodyBottom, bodyTop - bodyBottom, m.white).name = 'rectangular-enclosure-body';
  cabinet(bodyWidth + 0.03, bodyDepth + 0.03, 0.77, 0.075, m.dark).name = 'enclosure-lower-seal';
  // Four pitched roof faces descend from the mast collar to a projecting drip edge.
  // An actual opening remains around the continuous mast; the boot seals the roof penetration.
  var roofPositions = [], outerCorners = [], innerCorners = [];
  function triangle(a, b, c) { roofPositions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z); }
  function quad(a, b, c, d) { triangle(a, b, c); triangle(a, c, d); }
  for (i = 0; i < 4; i++) {
    var outerA = rectanglePoint(2.08, 1.74, i, bodyTop + 0.02), outerB = rectanglePoint(2.08, 1.74, i + 1, bodyTop + 0.02);
    var innerA = rectanglePoint(0.48, 0.48, i, roofPeak), innerB = rectanglePoint(0.48, 0.48, i + 1, roofPeak);
    outerCorners.push(outerA.toArray()); innerCorners.push(innerA.toArray());
    var oa = outerA.clone().add(new T.Vector3(0, -0.035, 0)), ob = outerB.clone().add(new T.Vector3(0, -0.035, 0));
    var ia = innerA.clone().add(new T.Vector3(0, -0.035, 0)), ib = innerB.clone().add(new T.Vector3(0, -0.035, 0));
    quad(outerA, innerA, innerB, outerB); quad(oa, ob, ib, ia);
    quad(outerA, outerB, ob, oa); quad(innerA, ia, ib, innerB);
  }
  var roofGeometry = new T.BufferGeometry(); roofGeometry.setAttribute('position', new T.Float32BufferAttribute(roofPositions, 3)); roofGeometry.computeVertexNormals();
  var roof = part(roofGeometry, m.silver, enclosure); roof.name = 'four-pitched-snow-shedding-roof';
  roof.userData = { sides: 4, outerCorners: outerCorners, innerCorners: innerCorners, width: 2.08, depth: 1.74,
    eaveY: bodyTop + 0.02, peakY: roofPeak, thickness: 0.035 };
  cylinder(0.16, 0.42, 0.12, m.rubber, 0, roofPeak + 0.025, 0).name = 'roof-mast-weather-boot';
  // A rolled service-panel edge catches a narrow highlight independently of its seal.
  function serviceGeometry(width) {
    var serviceShape = new T.Shape(), half = width / 2;
    serviceShape.moveTo(-half, -0.425); serviceShape.lineTo(half, -0.425);
    serviceShape.lineTo(half, 0.425); serviceShape.lineTo(-half, 0.425); serviceShape.closePath();
    return new T.ExtrudeGeometry(serviceShape, {depth: 0.009, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.008, bevelSegments: 3, steps: 1});
  }
  var serviceGeometries = [serviceGeometry(bodyWidth - 0.24), serviceGeometry(bodyDepth - 0.24)];
  // A stacked mark gives the name almost the full door width, without adding a plaque.
  var brandGeometry = new T.PlaneGeometry(1.24, 0.74);
  // Recessed service panels, restrained seams and flush fasteners, with no exposed cable loops.
  for (i = 0; i < 4; i++) {
    var face = new T.Group(), center = rectanglePoint(bodyWidth, bodyDepth, i, 0).add(rectanglePoint(bodyWidth, bodyDepth, i + 1, 0)).multiplyScalar(0.5);
    var panelWidth = (i % 2 === 0 ? bodyWidth : bodyDepth) - 0.24;
    face.name = 'equipment-service-face-' + (i + 1); face.userData = { side: i, panelWidth: panelWidth, brand: '寒域智测' };
    face.position.set(center.x, (bodyBottom + bodyTop) / 2, center.z); face.rotation.y = Math.atan2(center.x, center.z); enclosure.add(face);
    part(new T.BoxGeometry(panelWidth + 0.05, 0.91, 0.013), m.dark, face, 0, 0, 0.007);
    part(serviceGeometries[i % 2], m.white, face, 0, 0, 0.012);
    [-1, 1].forEach(function (side) {
      [-0.36, 0.36].forEach(function (y) {
        var fastener = part(new T.CylinderGeometry(0.015, 0.015, 0.009, 6), m.silver, face, side * (panelWidth / 2 - 0.06), y, 0.031); fastener.rotation.x = Math.PI / 2;
      });
    });
    if (m.decal) {
      // Flush ink, not a second plate: the service-door front is at local z = .029.
      var brand = part(brandGeometry, m.decal, face, 0, 0.040, 0.030);
      brand.castShadow = false;
      brand.name = 'hanyu-zhice-brand-face-' + (i + 1); brand.userData = { brand: '寒域智测', side: i, finish: 'direct-print' };
    }
    part(new T.BoxGeometry(0.16, 0.014, 0.008), m.dark, face, 0, -0.34, 0.031);
  }
  // Tension stays stabilize the one main mast; they are cables, not additional support poles.
  var stays = new T.Group(); stays.name = 'tension-cables'; station.add(stays);
  for (i = 0; i < 3; i++) {
    angle = i * Math.PI * 2 / 3 + 0.3;
    var x = Math.cos(angle) * 2.5, z = Math.sin(angle) * 2.5;
    var groundY = heightAt(x, z);
    rod([0, 0.68, 0], [x, groundY + 0.045, z], 0.009, m.silver, stays);
    var anchor = part(new T.CylinderGeometry(0.07, 0.07, 0.16, 8), m.dark, stays, x, groundY + 0.03, z); anchor.rotation.z = 0.25;
  }
  var power = createPower(T, m); station.add(power.group);
  // Measurement crossarms attach to the single mast; cups measure wind speed.
  rod([0, 4.84, 0], [-0.79, 4.84, 0.06], 0.034, m.silver);
  for (i = 0; i < 8; i++) cylinder(0.15, 0.195, 0.061, m.white, -0.80, 4.40 + i * 0.063, 0.06);
  cylinder(0.20, 0.195, 0.04, m.frost, -0.80, 4.92, 0.06);
  rod([0, 5.24, 0], [0.7, 5.24, 0], 0.029, m.silver);
  cylinder(0.042, 0.048, 0.30, m.silver, 0.7, 5.39, 0);
  var cups = new T.Group(); cups.name = 'wind-speed-sensor'; cups.position.set(0.7, 5.54, 0); station.add(cups);
  part(new T.CylinderGeometry(0.055, 0.055, 0.13, 20), m.dark, cups);
  for (i = 0; i < 3; i++) {
    angle = i * Math.PI * 2 / 3;
    x = Math.cos(angle) * 0.28; z = Math.sin(angle) * 0.28;
    rod([0, 0, 0], [x, 0, z], 0.012, m.silver, cups);
    var cup = part(new T.SphereGeometry(0.094, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), m.dark, cups, x, 0, z);
    cup.material = m.cups || m.dark; cup.rotation.z = Math.PI / 2; cup.rotation.y = -angle;
  }
  rod([0, 4.5, 0], [0.52, 4.5, 0.34], 0.024, m.silver);
  cylinder(0.13, 0.12, 0.055, m.white, 0.52, 4.54, 0.34);
  part(new T.SphereGeometry(0.075, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), m.dark, station, 0.52, 4.57, 0.34);
  rod([0, 5.10, 0], [-0.98, 5.10, -0.50], 0.026, m.silver);
  cylinder(0.030, 0.048, 1.08, m.rubber, -0.98, 5.66, -0.50);
  cylinder(0.013, 0.02, 0.45, m.silver, -0.98, 6.39, -0.50);
  part(new T.SphereGeometry(0.034, 12, 8), m.glow, station, -0.98, 6.63, -0.50);
  return { group: station, mast: mast, power: power, cups: cups, enclosure: enclosure, roof: roof, anchors: {
    antenna: new T.Vector3(-0.98, 6.63, -0.50), sensor: new T.Vector3(-0.80, 4.82, 0.06), solar: new T.Vector3(0.70, 3.65, 0)
  } };
});
