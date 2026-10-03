/* Surface-following snow deposits. Visual weathering, not a physical snow-load model. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory;
  else root.createPolarSnow = factory;
})(typeof window === 'undefined' ? globalThis : window, function (T, model, material) {
  'use strict';
  var group = new T.Group(); group.name = 'surface-snow-accumulation'; model.group.add(group);
  var patches = [];
  function noise(x, y) {
    var ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
    function hash(a, b) { var n = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return n - Math.floor(n); }
    return (hash(ix, iy) * (1 - fx) + hash(ix + 1, iy) * fx) * (1 - fy) + (hash(ix, iy + 1) * (1 - fx) + hash(ix + 1, iy + 1) * fx) * fy;
  }
  // Closed, softly irregular slabs, rather than white floating particles or intersecting spheres.
  function deposit(name, parent, nx, nz, surface, thickness) {
    var positions = [], colors = [], uv = [], indices = [], count = (nx + 1) * (nz + 1);
    for (var layer = 0; layer < 2; layer++) for (var z = 0; z <= nz; z++) for (var x = 0; x <= nx; x++) {
      var u = x / nx, v = z / nz, p = surface(u, v);
      var edge = Math.pow(Math.max(0, Math.sin(u * Math.PI) * Math.sin(v * Math.PI)), 0.65);
      var grain = noise(u * 7.3 + 13, v * 4.1) * 0.6 + noise(u * 28.1, v * 17.7) * 0.27 + noise(u * 81.2, v * 51.3) * 0.13;
      var ridge = Math.pow(Math.max(0, 1 - Math.abs(v - (0.35 + noise(u * 4, 9) * 0.3)) * 2), 1.4);
      p.y += layer === 0 ? 0.003 + thickness * (0.04 + edge * ridge) * (0.35 + grain) : -0.003;
      positions.push(p.x, p.y, p.z);
      uv.push(p.x, p.z);
      var shade = layer === 0 ? 0.79 + edge * 0.14 + grain * 0.06 : 0.69;
      colors.push(shade * 0.96, shade * 0.99, Math.min(1, shade + 0.035));
    }
    function quad(a, b, c, d) { indices.push(a, b, c, a, c, d); }
    for (z = 0; z < nz; z++) for (x = 0; x < nx; x++) {
      var a = z * (nx + 1) + x, b = a + 1, c = a + nx + 2, d = a + nx + 1;
      quad(a, d, c, b); quad(a + count, b + count, c + count, d + count);
    }
    for (x = 0; x < nx; x++) {
      quad(x, x + 1, x + 1 + count, x + count);
      a = nz * (nx + 1) + x; quad(a + 1, a, a + count, a + 1 + count);
    }
    for (z = 0; z < nz; z++) {
      a = z * (nx + 1); b = a + nx + 1; quad(b, a, a + count, b + count);
      a += nx; b += nx; quad(a, b, b + count, a + count);
    }
    var geometry = new T.BufferGeometry(); geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3)); geometry.setAttribute('color', new T.Float32BufferAttribute(colors, 3)); geometry.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); geometry.setIndex(indices); geometry.computeVertexNormals();
    var mesh = new T.Mesh(geometry, material); mesh.name = name; mesh.castShadow = mesh.receiveShadow = true;
    parent.add(mesh); patches.push(mesh); return mesh;
  }
  var roof = model.roof.userData;
  function vertex(radius, i, y) { var a = Math.PI / 4 + i * Math.PI * 2 / 3; return new T.Vector3(Math.cos(a) * radius, y, Math.sin(a) * radius); }
  for (var side = 0; side < 3; side++) {
    (function (side) {
      // Parameterization follows each pitched face; the upper throat stays clear of the PV braces.
      var oa = vertex(roof.outerRadius, side, roof.eaveY), ob = vertex(roof.outerRadius, side + 1, roof.eaveY);
      var ia = vertex(roof.innerRadius, side, roof.peakY), ib = vertex(roof.innerRadius, side + 1, roof.peakY);
      deposit('roof-snow-' + side, group, 40, 20, function (u, v) {
        var along = 0.07 + u * 0.83 + (noise(v * 13, side * 3) - 0.5) * 0.065;
        var lower = 0.018 + noise(u * 17 + side, 3) * 0.12;
        var upper = (side === 2 ? 0.72 : 0.56) - noise(u * 8 + side * 7, 4) * 0.18;
        var uphill = lower + v * (upper - lower);
        return oa.clone().lerp(ob, along).lerp(ia.clone().lerp(ib, along), uphill);
      }, side === 2 ? 0.105 : side === 0 ? 0.075 : 0.045);
    })(side);
  }
  model.power.panels.forEach(function (panel, index) {
    var width = panel.userData.width, y = panel.userData.height / 2 + 0.027;
    deposit('pv-frame-snow-' + index, panel, 40, 10, function (u, v) {
      var breadth = 0.06 + noise(u * 11, index * 7) * 0.12;
      var along = -0.49 + u * (0.63 + index * 0.035) + (noise(v * 12, 7 + index) - 0.5) * 0.018;
      return new T.Vector3(along * width, y, -0.045 + breadth * v);
    }, 0.065 + index * 0.008);
    deposit('pv-frame-drift-fragment-' + index, panel, 16, 8, function (u, v) {
      var along = 0.27 + u * 0.22 + (noise(v * 8, index) - 0.5) * 0.018;
      return new T.Vector3(along * width, y, -0.032 + v * (0.065 + noise(u * 9, index) * 0.04));
    }, 0.045);
    // A shallow drift rests on the lower lip; the active blue cell faces remain legible.
    deposit('pv-lower-lip-snow-' + index, panel, 28, 4, function (u, v) {
      return new T.Vector3((-0.42 + u * 0.70) * width, -y + 0.045, 0.028 + v * (0.025 + noise(u * 12, index) * 0.035));
    }, 0.035);
  });
  deposit('sensor-cap-snow', group, 14, 10, function (u, v) {
    return new T.Vector3(-0.8 + (u - 0.5) * (0.19 + Math.sin(v * Math.PI) * 0.10), 4.945, 0.06 + (v - 0.5) * 0.27);
  }, 0.075);
  group.userData = { depositCount: patches.length, conceptOnly: true };
  return { group: group, patches: patches };
});
