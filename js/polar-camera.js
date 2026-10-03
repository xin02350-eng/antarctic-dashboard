/* Camera composition and render eligibility, independent of the WebGL runtime. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PolarCamera = api;
})(typeof window === 'undefined' ? globalThis : window, function () {
  'use strict';
  function profile(name, width, height) {
    var hero = name === 'hero';
    width = Number.isFinite(width) && width > 0 ? width : 1440;
    height = Number.isFinite(height) && height > 0 ? height : 900;
    if (!hero) return {
      name: 'standard', horizontalOffset: 0.18, verticalOffset: -0.015,
      presets: {
        wide: { azimuth: 0.65, elevation: 0.10, radius: 19.8, targetY: 3.15 },
        close: { azimuth: 0.77, elevation: 0.16, radius: 15.8, targetY: 3.25 },
        top: { azimuth: 0.72, elevation: 0.86, radius: 19.8, targetY: 3.15 }
      }
    };
    // Move the lens rather than the model: one unchanged foundation remains on the ice.
    // A slightly more distant lens on narrow canvases keeps the stays clear of the copy.
    var narrow = width / height < 1.45;
    return {
      name: 'hero', horizontalOffset: narrow ? 0.17 : 0.16, verticalOffset: -0.005,
      presets: {
        wide: { azimuth: 0.65, elevation: 0.10, radius: narrow ? 16.1 : 15.6, targetY: 3.15 },
        close: { azimuth: 0.84, elevation: 0.17, radius: narrow ? 15.4 : 15.0, targetY: 3.15 },
        top: { azimuth: 0.72, elevation: 0.82, radius: 17.0, targetY: 2.70 }
      }
    };
  }
  function visibilityGate(origin, parentWindow) {
    var pageVisible = true, parentVisible = true, contextAvailable = true;
    return {
      active: function () { return pageVisible && parentVisible && contextAvailable; },
      page: function (visible) { pageVisible = Boolean(visible); },
      context: function (available) { contextAvailable = Boolean(available); },
      message: function (event) {
        if (!event || event.origin !== origin || event.source !== parentWindow ||
          !event.data || event.data.type !== 'dms:field-visibility' || typeof event.data.visible !== 'boolean') return false;
        parentVisible = event.data.visible;
        return true;
      }
    };
  }
  return { profile: profile, visibilityGate: visibilityGate };
});
