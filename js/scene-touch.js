/* Shared touch state only: the scene retains its camera and single render loop. */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SceneTouch = api;
})(typeof window === 'undefined' ? this : window, function () {
  'use strict';
  function create(canvas, options) {
    var points = [], pinchDistance = 0;
    function index(id) { for (var i = 0; i < points.length; i++) if (points[i].id === id) return i; return -1; }
    function valid(event) { return Number.isFinite(event.clientX) && Number.isFinite(event.clientY); }
    function touch(event) { return event && (event.pointerType === 'touch' || index(event.pointerId) !== -1); }
    function distance() {
      if (points.length < 2) return 0;
      var dx = points[0].x - points[1].x, dy = points[0].y - points[1].y;
      return Math.sqrt(dx * dx + dy * dy);
    }
    function rebase() { var value = distance(); pinchDistance = value > 4 ? value : 0; }
    function prevent(event) { if (event.cancelable && event.preventDefault) event.preventDefault(); }
    function capture(id, release) {
      try {
        if (release) { if (canvas.releasePointerCapture) canvas.releasePointerCapture(id); }
        else if (canvas.setPointerCapture) canvas.setPointerCapture(id);
      } catch (error) { /* Window up/cancel listeners remain the capture fallback. */ }
    }
    function down(event) {
      if (!touch(event)) return false;
      prevent(event);
      if (!valid(event) || index(event.pointerId) !== -1) return true;
      points.push({ id: event.pointerId, x: event.clientX, y: event.clientY });
      rebase(); capture(event.pointerId, false);
      if (points.length === 1) options.active(true);
      return true;
    }
    function move(event) {
      if (!touch(event)) return false;
      prevent(event);
      var i = index(event.pointerId);
      if (i < 0 || !valid(event)) return true;
      var point = points[i], dx = event.clientX - point.x, dy = event.clientY - point.y;
      point.x = event.clientX; point.y = event.clientY;
      if (points.length === 1) { if (dx || dy) options.rotate(dx, dy); }
      else if (i < 2) {
        var next = distance();
        // Coincident fingers establish a new baseline instead of a huge zoom.
        if (pinchDistance > 4 && next > 4 && next !== pinchDistance) options.zoom(pinchDistance / next);
        pinchDistance = next > 4 ? next : 0;
      }
      return true;
    }
    function up(event) {
      if (!touch(event)) return false;
      var i = index(event.pointerId);
      if (i < 0) return true;
      points.splice(i, 1); rebase();
      if (!points.length) options.active(false);
      // Remove first: synchronous lostpointercapture cannot end another finger.
      if (event.type !== 'lostpointercapture') capture(event.pointerId, true);
      return true;
    }
    function clear() {
      var previous = points; points = []; pinchDistance = 0;
      if (previous.length) options.active(false);
      previous.forEach(function (point) { capture(point.id, true); });
    }
    return { down: down, move: move, up: up, clear: clear };
  }
  return { create: create };
});
