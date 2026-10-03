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
  // Enlarged triangular equipment enclosure: centered on the mast, aligned with the PV prism.
  var enclosure = new T.Group(); enclosure.name = 'coaxial-triangular-equipment-enclosure'; station.add(enclosure);
  var bodyRadius = 1.12, bodyBottom = 0.82, bodyTop = 1.96, roofPeak = 2.36, roofRadius = 1.18;
  enclosure.userData = { sides: 3, radius: bodyRadius, bottom: bodyBottom, top: bodyTop, boreRadius: 0.19 };
  function trianglePoint(radius, index, y) {
    var theta = Math.PI / 4 + index * Math.PI * 2 / 3;
    return new T.Vector3(Math.cos(theta) * radius, y, Math.sin(theta) * radius);
  }
  function prism(radius, bottom, height, material) {
    var shape = new T.Shape();
    for (var j = 0; j < 3; j++) {
      var p = trianglePoint(radius, j, 0);
      if (j === 0) shape.moveTo(p.x, -p.z); else shape.lineTo(p.x, -p.z);
    }
    shape.closePath();
    var bore = new T.Path(); bore.absarc(0, 0, 0.19, 0, Math.PI * 2, true); shape.holes.push(bore);
    var geometry = new T.ExtrudeGeometry(shape, { depth: height, bevelEnabled: true, bevelSize: 0.008, bevelThickness: 0.008, bevelSegments: 2, steps: 1, curveSegments: 24 });
    geometry.rotateX(-Math.PI / 2);
    return part(geometry, material, enclosure, 0, bottom, 0);
  }
  prism(bodyRadius, bodyBottom, bodyTop - bodyBottom, m.white).name = 'triangular-enclosure-body';
  prism(1.135, 0.77, 0.075, m.dark).name = 'enclosure-lower-seal';
  // Three pitched roof faces descend from the mast collar to a projecting drip edge.
  // An actual opening remains around the continuous mast; the boot seals the roof penetration.
  var roofPositions = [];
  function triangle(a, b, c) { roofPositions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z); }
  function quad(a, b, c, d) { triangle(a, b, c); triangle(a, c, d); }
  for (i = 0; i < 3; i++) {
    var outerA = trianglePoint(roofRadius, i, bodyTop + 0.02), outerB = trianglePoint(roofRadius, i + 1, bodyTop + 0.02);
    var innerA = trianglePoint(0.32, i, roofPeak), innerB = trianglePoint(0.32, i + 1, roofPeak);
    var oa = outerA.clone().add(new T.Vector3(0, -0.035, 0)), ob = outerB.clone().add(new T.Vector3(0, -0.035, 0));
    var ia = innerA.clone().add(new T.Vector3(0, -0.035, 0)), ib = innerB.clone().add(new T.Vector3(0, -0.035, 0));
    quad(outerA, innerA, innerB, outerB); quad(oa, ob, ib, ia);
    quad(outerA, outerB, ob, oa); quad(innerA, ia, ib, innerB);
  }
  var roofGeometry = new T.BufferGeometry(); roofGeometry.setAttribute('position', new T.Float32BufferAttribute(roofPositions, 3)); roofGeometry.computeVertexNormals();
  var roof = part(roofGeometry, m.silver, enclosure); roof.name = 'three-pitched-snow-shedding-roof';
  roof.userData = { outerRadius: roofRadius, innerRadius: 0.32, eaveY: bodyTop + 0.02, peakY: roofPeak, thickness: 0.035 };
  cylinder(0.16, 0.33, 0.12, m.rubber, 0, roofPeak + 0.025, 0).name = 'roof-mast-weather-boot';
  // A rolled service-panel edge catches a narrow highlight independently of its seal.
  var serviceShape = new T.Shape();
  serviceShape.moveTo(-0.735, -0.425); serviceShape.lineTo(0.735, -0.425);
  serviceShape.lineTo(0.735, 0.425); serviceShape.lineTo(-0.735, 0.425); serviceShape.closePath();
  var serviceGeometry = new T.ExtrudeGeometry(serviceShape, {depth: 0.009, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.008, bevelSegments: 3, steps: 1});
  // Recessed service panels, restrained seams and flush fasteners, with no exposed cable loops.
  for (i = 0; i < 3; i++) {
    var face = new T.Group(), center = trianglePoint(bodyRadius, i, 0).add(trianglePoint(bodyRadius, i + 1, 0)).multiplyScalar(0.5);
    face.position.set(center.x, (bodyBottom + bodyTop) / 2, center.z); face.rotation.y = Math.atan2(center.x, center.z); enclosure.add(face);
    part(new T.BoxGeometry(1.53, 0.91, 0.013), m.dark, face, 0, 0, 0.007);
    part(serviceGeometry, m.white, face, 0, 0, 0.012);
    [-1, 1].forEach(function (side) {
      [-0.36, 0.36].forEach(function (y) {
        var fastener = part(new T.CylinderGeometry(0.015, 0.015, 0.009, 6), m.silver, face, side * 0.67, y, 0.029); fastener.rotation.x = Math.PI / 2;
      });
    });
    if (m.decal) part(new T.PlaneGeometry(0.65, 0.20), m.decal, face, 0, 0.12, 0.026);
    part(new T.BoxGeometry(0.16, 0.014, 0.008), m.dark, face, 0, -0.27, 0.029);
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
