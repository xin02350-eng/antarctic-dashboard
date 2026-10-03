/* Static scene compaction. Keeps the original materials and all dynamic subtrees. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PolarBatch = api;
})(typeof window === 'undefined' ? globalThis : window, function () {
  'use strict';
  function compact(T, root, options) {
    options = options || {};
    var stats = { before: 0, after: 0, merged: 0, batches: 0, saved: 0, trianglesBefore: 0, trianglesAfter: 0 };
    if (!T || !root || !root.traverse || !root.updateMatrixWorld || !T.Matrix4 ||
        !T.BufferGeometry || !T.BufferAttribute || !T.Mesh) {
      stats.reason = 'unavailable'; return stats;
    }
    var excluded = options.exclude || [], groups = new Map(), staged = [];
    function visible(object) {
      for (var parent = object; parent; parent = parent.parent) {
        if (parent.visible === false) return false;
        if (parent === root) break;
      }
      return true;
    }
    function omitted(object) {
      for (var parent = object; parent; parent = parent.parent) {
        if (excluded.indexOf(parent) >= 0) return true;
        if (parent === root) break;
      }
      return false;
    }
    function triangles(object) {
      var geometry = object.geometry;
      if (!geometry || !geometry.attributes || !geometry.attributes.position) return 0;
      var count = geometry.index ? geometry.index.count : geometry.attributes.position.count;
      return count / 3 * (object.isInstancedMesh ? object.count : 1);
    }
    function measure() {
      var result = { calls: 0, triangles: 0 };
      root.traverse(function (object) {
        if (!object.isMesh || !visible(object)) return;
        result.calls += Array.isArray(object.material) ? (object.geometry.groups || []).length : 1;
        result.triangles += triangles(object);
      });
      return result;
    }
    var baseline = measure();
    stats.before = stats.after = baseline.calls;
    stats.trianglesBefore = stats.trianglesAfter = baseline.triangles;
    function abort(error) {
      staged.forEach(function (entry) { entry.mesh.geometry.dispose(); });
      stats.reason = 'unsupported';
      if (error && error.message) stats.detail = error.message;
      return stats;
    }
    try {
      var inverse = new T.Matrix4();
      if (!inverse.invert || !inverse.copy || !inverse.multiplyMatrices) return abort();
      if (root.updateWorldMatrix) root.updateWorldMatrix(true, true); else root.updateMatrixWorld(true);
      if (!root.matrixWorld || Math.abs(root.matrixWorld.determinant()) < 1e-10) return abort();
      inverse.copy(root.matrixWorld).invert();
      root.traverse(function (object) {
        var geometry = object.geometry;
        if (!object.isMesh || object.isInstancedMesh || object.isSkinnedMesh || !object.material ||
            Array.isArray(object.material) || object.children.length || !visible(object) || omitted(object) ||
            !geometry || !geometry.isBufferGeometry || !geometry.clone || !geometry.toNonIndexed ||
            !geometry.attributes.position || Object.keys(geometry.morphAttributes || {}).length ||
            (Object.prototype.hasOwnProperty.call(object, 'drawMode') && object.drawMode !== T.TrianglesDrawMode)) return;
        // Custom shaders can depend on the original object-space position (the snow grain does).
        // Keeping those draws intact guarantees compaction does not move any procedural texture.
        if (object.material.transparent || object.material.isShaderMaterial || object.material.isRawShaderMaterial ||
            (T.Material && object.material.onBeforeCompile !== T.Material.prototype.onBeforeCompile) ||
            (T.Object3D && object.onBeforeRender !== T.Object3D.prototype.onBeforeRender) ||
            (T.Object3D && object.onAfterRender !== T.Object3D.prototype.onAfterRender)) return;
        var count = geometry.index ? geometry.index.count : geometry.attributes.position.count;
        if (!count || count % 3 || geometry.drawRange.start !== 0 || geometry.drawRange.count < count) return;
        var names = Object.keys(geometry.attributes).sort(), layout = [], supported = true;
        names.forEach(function (name) {
          var attribute = geometry.attributes[name];
          if (!attribute.array || attribute.isInterleavedBufferAttribute || attribute.isInstancedBufferAttribute ||
              attribute.count !== geometry.attributes.position.count || !attribute.array.constructor) supported = false;
          else layout.push(name + ':' + attribute.array.constructor.name + ':' + attribute.itemSize + ':' + attribute.normalized);
        });
        if (!supported) return;
        var transform = new T.Matrix4().multiplyMatrices(inverse, object.matrixWorld);
        // Mirrored transforms require winding and tangent-handedness changes; leave those meshes intact.
        if (transform.determinant() <= 0) return;
        var signature = [object.material.uuid || object.material.id, object.castShadow, object.receiveShadow,
          object.renderOrder, object.layers.mask, object.frustumCulled, layout.join('|')].join(';');
        if (!groups.has(signature)) groups.set(signature, []);
        groups.get(signature).push({ object: object, transform: transform, names: names });
      });
      groups.forEach(function (members) {
        if (members.length < 2) return;
        var parts = [], combined;
        try {
          var total = 0;
          members.forEach(function (member) {
            var geometry = member.object.geometry.clone();
            parts.push(geometry);
            geometry.applyMatrix4(member.transform);
            if (geometry.index) {
              var expanded = geometry.toNonIndexed();
              geometry.dispose(); parts[parts.length - 1] = geometry = expanded;
            }
            total += geometry.attributes.position.count;
          });
          combined = new T.BufferGeometry();
          members[0].names.forEach(function (name) {
            var source = parts[0].attributes[name], array = new source.array.constructor(total * source.itemSize), offset = 0;
            parts.forEach(function (part) { array.set(part.attributes[name].array, offset); offset += part.attributes[name].array.length; });
            combined.setAttribute(name, new T.BufferAttribute(array, source.itemSize, source.normalized));
          });
          combined.computeBoundingBox(); combined.computeBoundingSphere();
          var original = members[0].object, mesh = new T.Mesh(combined, original.material);
          mesh.name = 'static-material-batch-' + staged.length;
          mesh.castShadow = original.castShadow; mesh.receiveShadow = original.receiveShadow;
          mesh.renderOrder = original.renderOrder; mesh.layers.mask = original.layers.mask;
          mesh.frustumCulled = original.frustumCulled; mesh.matrixAutoUpdate = false;
          mesh.userData.sourceNames = members.map(function (member) { return member.object.name; });
          staged.push({ mesh: mesh, members: members });
          combined = null;
        } finally {
          parts.forEach(function (geometry) { geometry.dispose(); });
          if (combined) combined.dispose();
        }
      });
    } catch (error) { return abort(error); }
    // Geometry work above is transactional: no original mesh is removed until every batch succeeds.
    staged.forEach(function (entry) {
      root.add(entry.mesh);
      entry.members.forEach(function (member) { member.object.parent.remove(member.object); });
      stats.merged += entry.members.length;
    });
    stats.batches = staged.length;
    var result = measure(); stats.after = result.calls; stats.trianglesAfter = result.triangles;
    stats.saved = stats.before - stats.after;
    stats.reason = staged.length ? 'compacted' : 'unchanged';
    return stats;
  }
  return { compact: compact };
});
