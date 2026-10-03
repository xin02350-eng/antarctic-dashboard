/* Original concept power assembly. Geometry is also testable without WebGL. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory;
  else root.createPolarPower = factory;
})(typeof window === 'undefined' ? globalThis : window, function (T, materials, options) {
  'use strict';
  options = options || {};
  function canInstance() {
    if (options.instancing === false || !T.InstancedMesh) return false;
    var renderer = options.renderer;
    if (!renderer) return true;
    if (renderer.capabilities && renderer.capabilities.isWebGL2) return true;
    // A missing/blocked WebGL1 extension must never silently remove all photovoltaic cells.
    try {
      return !!(renderer.extensions && (renderer.extensions.has ? renderer.extensions.has('ANGLE_instanced_arrays') :
        renderer.extensions.get && renderer.extensions.get('ANGLE_instanced_arrays')));
    } catch (error) { return false; }
  }
  var instancing = canInstance(), fallbackCells, fallbackTraces, fallbackCellMaterial;
  var assembly = new T.Group(); assembly.name = 'solar-power-assembly';
  var solar = new T.Group(); solar.name = 'three-panel-solar-prism';
  solar.position.y = 3.45; assembly.add(solar);
  var radius = 1.40, height = 1.58, vertices = [], panels = [];
  var silver = materials.silver, dark = materials.dark, white = materials.white;
  function part(geometry, material, parent, x, y, z) {
    var object = new T.Mesh(geometry, material);
    object.position.set(x || 0, y || 0, z || 0);
    object.castShadow = object.receiveShadow = true; parent.add(object); return object;
  }
  function box(w, h, d, material, parent, x, y, z) { return part(new T.BoxGeometry(w, h, d), material, parent, x, y, z); }
  function rod(a, b, r, material, parent) {
    var start = new T.Vector3().fromArray(a), end = new T.Vector3().fromArray(b);
    var object = part(new T.CylinderGeometry(r, r, start.distanceTo(end), 12), material, parent);
    object.position.copy(start.clone().add(end).multiplyScalar(0.5));
    object.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), end.sub(start).normalize()); return object;
  }
  for (var k = 0; k < 3; k++) {
    var angle = Math.PI / 4 + k * Math.PI * 2 / 3;
    vertices.push([Math.cos(angle) * radius, Math.sin(angle) * radius]);
  }
  var width = Math.sqrt(3) * radius;
  var cellWidth = (width - 0.16) / 5, cellHeight = (height - 0.14) / 8;
  var cellShape = new T.Shape(), cw = cellWidth * 0.49, ch = cellHeight * 0.485, corner = 0.010;
  cellShape.moveTo(-cw + corner, -ch); cellShape.lineTo(cw - corner, -ch);
  cellShape.lineTo(cw, -ch + corner); cellShape.lineTo(cw, ch - corner);
  cellShape.lineTo(cw - corner, ch); cellShape.lineTo(-cw + corner, ch);
  cellShape.lineTo(-cw, ch - corner); cellShape.lineTo(-cw, -ch + corner); cellShape.closePath();
  var cellGeo = new T.ShapeGeometry(cellShape);
  var matrixObject = new T.Object3D();
  function repeatedGeometry(base, copies, colors) {
    var flat = base.index ? base.toNonIndexed() : base, count = flat.attributes.position.count;
    var result = new T.BufferGeometry();
    Object.keys(flat.attributes).forEach(function (name) {
      var attribute = flat.attributes[name], array = new attribute.array.constructor(attribute.array.length * copies.length);
      copies.forEach(function (point, instance) {
        var offset = instance * attribute.array.length;
        array.set(attribute.array, offset);
        if (name === 'position') for (var vertex = 0; vertex < count; vertex++) {
          array[offset + vertex * 3] += point[0]; array[offset + vertex * 3 + 1] += point[1]; array[offset + vertex * 3 + 2] += point[2];
        }
      });
      result.setAttribute(name, new T.BufferAttribute(array, attribute.itemSize, attribute.normalized));
    });
    if (colors) {
      var color = new Float32Array(count * copies.length * 3);
      colors.forEach(function (value, instance) {
        for (var vertex = 0; vertex < count; vertex++) value.toArray(color, (instance * count + vertex) * 3);
      });
      result.setAttribute('color', new T.BufferAttribute(color, 3));
    }
    result.computeBoundingBox(); result.computeBoundingSphere();
    if (flat !== base) flat.dispose();
    return result;
  }
  function fallbackGeometry() {
    if (fallbackCells) return;
    var positions = [], traces = [], colors = [];
    for (var row = 0; row < 8; row++) for (var col = 0; col < 5; col++) {
      var x = (col - 2) * cellWidth, y = (row - 3.5) * cellHeight;
      positions.push([x, y, 0.030]);
      colors.push(new T.Color().setHSL(0.60 + col * 0.002, 0.40, 0.057 + (row % 3) * 0.003));
      [-0.12, 0, 0.12].forEach(function (offset) { traces.push([x + offset, y, 0.032]); });
    }
    fallbackCells = repeatedGeometry(cellGeo, positions, colors);
    var traceBase = new T.BoxGeometry(0.0025, cellHeight * 0.93, 0.001);
    fallbackTraces = repeatedGeometry(traceBase, traces); traceBase.dispose();
    // Clone only in the compatibility path: vertex colors exactly replace instance colors.
    fallbackCellMaterial = materials.cell.clone(); fallbackCellMaterial.vertexColors = true;
  }
  vertices.forEach(function (a, index) {
    var b = vertices[(index + 1) % 3], panel = new T.Group();
    panel.name = 'photovoltaic-panel-' + (index + 1);
    panel.userData = { start: a.slice(), end: b.slice(), width: width, height: height };
    panel.position.set((a[0] + b[0]) / 2, 0, (a[1] + b[1]) / 2);
    panel.rotation.y = Math.atan2(panel.position.x, panel.position.z);
    solar.add(panel); panels.push(panel);
    box(width, height, 0.055, dark, panel);
    [-1, 1].forEach(function (sign) {
      box(width + 0.025, 0.045, 0.092, silver, panel, 0, sign * height / 2, 0);
      box(0.040, height, 0.092, silver, panel, sign * width / 2, 0, 0);
    });
    // Frost only collects along the upper edge; leave the PV faces readable.
    box(width, 0.009, 0.057, materials.frost, panel, 0, height / 2 + 0.026, 0);
    var cells, traces;
    if (instancing) {
      cells = new T.InstancedMesh(cellGeo, materials.cell, 40);
      traces = new T.InstancedMesh(new T.BoxGeometry(0.0025, cellHeight * 0.93, 0.001), materials.trace, 120);
      var cellIndex = 0, traceIndex = 0;
      for (var row = 0; row < 8; row++) for (var col = 0; col < 5; col++) {
        var x = (col - 2) * cellWidth, y = (row - 3.5) * cellHeight;
        matrixObject.position.set(x, y, 0.030); matrixObject.updateMatrix();
        cells.setMatrixAt(cellIndex, matrixObject.matrix);
        cells.setColorAt(cellIndex++, new T.Color().setHSL(0.60 + col * 0.002, 0.40, 0.057 + (row % 3) * 0.003));
        [-0.12, 0, 0.12].forEach(function (offset) {
          matrixObject.position.set(x + offset, y, 0.032); matrixObject.updateMatrix(); traces.setMatrixAt(traceIndex++, matrixObject.matrix);
        });
      }
    } else {
      fallbackGeometry();
      cells = new T.Mesh(fallbackCells, fallbackCellMaterial); traces = new T.Mesh(fallbackTraces, materials.trace);
    }
    cells.name = 'individual-pv-cells'; cells.receiveShadow = true; cells.userData.cellCount = 40;
    traces.name = 'pv-busbar-traces'; traces.userData.traceCount = 120;
    panel.add(cells, traces);
    for (var j = 0; j < 5; j++) [-1, 1].forEach(function (side) {
      var bolt = part(new T.CylinderGeometry(0.015, 0.015, 0.012, 6), silver, panel, (j - 2) * width / 4.25, side * height / 2, 0.052);
      bolt.rotation.x = Math.PI / 2;
    });
    // Interior diagonal brace and sealed junction box are visible from above.
    rod([-width / 2 + 0.1, -height / 2 + 0.1, -0.06], [width / 2 - 0.1, height / 2 - 0.1, -0.06], 0.015, silver, panel);
    box(0.24, 0.17, 0.09, dark, panel, 0, -0.38, -0.09);
    rod([0, -0.38, -0.15], [0, -height / 2 - 0.18, -0.15], 0.011, materials.rubber, panel);
    rod([a[0], -height / 2 - 0.12, a[1]], [a[0], height / 2 + 0.035, a[1]], 0.035, silver, solar);
    rod([a[0], -height / 2 - 0.13, a[1]], [0, -0.90, 0], 0.038, silver, solar).name = 'pv-lower-support';
    rod([a[0], height / 2, a[1]], [0, height / 2, 0], 0.024, dark, solar);
  });
  assembly.userData = { photovoltaicPanelCount: 3, windGeneratorCount: 0, coaxial: true, conceptOnly: true,
    photovoltaicRendering: instancing ? 'instanced' : 'merged-webgl1' };
  return { group: assembly, solar: solar, panels: panels, vertices: vertices };
});
