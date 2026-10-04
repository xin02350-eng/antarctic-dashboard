/* Original desktop atmosphere: wind-driven powder, not ornamental snowfall. */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    var controller = api.create({ window: root, document: root.document,
      host: root.document.getElementById('polarAtmosphere') });
    root.ExpeditionAtmosphere = {
      create: api.create, setView: controller.setView, destroy: controller.destroy
    };
  }
})(typeof window === 'undefined' ? globalThis : window, function () {
  'use strict';
  var FRAME_INTERVAL = 1000 / 30, MAX_DELTA = 1 / 15, MAX_DPR = 1.5;
  var MAX_PIXELS = 2000000, LOW_PIXELS = 1100000;
  var clamp = function (value, low, high) { return Math.min(high, Math.max(low, value)); };
  function pixelRatio(width, height, deviceDpr, navigator) {
    width = Number.isFinite(width) && width > 0 ? width : 1440;
    height = Number.isFinite(height) && height > 0 ? height : 900;
    deviceDpr = Number.isFinite(deviceDpr) && deviceDpr > 0 ? deviceDpr : 1;
    navigator = navigator || {};
    var memory = Number(navigator.deviceMemory), cores = Number(navigator.hardwareConcurrency);
    var constrained = Number.isFinite(memory) && memory > 0 && memory <= 4 ||
      Number.isFinite(cores) && cores > 0 && cores <= 4 ||
      !!(navigator.connection && navigator.connection.saveData);
    // Snow remains in CSS-pixel coordinates. Only its backing store changes:
    // a 4K display must not multiply every transparent full-screen composite.
    return Math.min(deviceDpr, constrained ? 1 : MAX_DPR,
      Math.sqrt((constrained ? LOW_PIXELS : MAX_PIXELS) / (width * height)));
  }
  function random(seed) {
    var state = (Number(seed) >>> 0) || 846201;
    return function () {
      state += 0x6D2B79F5;
      var value = Math.imul(state ^ state >>> 15, 1 | state);
      value ^= value + Math.imul(value ^ value >>> 7, 61 | value);
      return ((value ^ value >>> 14) >>> 0) / 4294967296;
    };
  }
  function makeField(width, height, seed) {
    width = Number.isFinite(width) && width > 0 ? width : 1440;
    height = Number.isFinite(height) && height > 0 ? height : 900;
    var rand = random(seed), area = clamp(width * height / 1296000, 0.7, 1.25);
    var counts = { powder: Math.round(260 * area), streak: Math.round(clamp(210 * area, 170, 265)),
      near: Math.round(clamp(44 * area, 35, 55)) };
    var particles = [], padding = 120;
    Object.keys(counts).forEach(function (layer) {
      for (var i = 0; i < counts[layer]; i++) {
        particles.push({ layer: layer, x: rand() * (width + padding * 2) - padding,
          y: Math.pow(rand(), 0.75) * (height + padding * 2) - padding,
          phase: rand() * Math.PI * 2, speed: 0.65 + rand() * 0.7,
          radius: 0.55 + rand() * 0.55,
          length: layer === 'near' ? 12 + rand() * 14 : layer === 'streak' ? 4 + rand() * 5 : 0.65 + rand() * 1.75,
          alpha: layer === 'powder' ? 0.24 + rand() * 0.18 : layer === 'streak' ? 0.42 + rand() * 0.36 : 0.18 + rand() * 0.16,
          rotation: rand() * Math.PI * 2, spin: (rand() - 0.5) * 0.55,
          variant: Math.floor(rand() * 3), aspect: 0.65 + rand() * 0.3,
          windSlope: 0.36, gust: 0.9 });
      }
    });
    var veils = [];
    for (var j = 0; j < 6; j++) veils.push({ x: j === 0 ? width * 0.06 : j === 1 ? width * 0.96 : rand() * width,
      y: height * (j === 0 ? 0.73 : j === 1 ? 0.51 : 0.6 + rand() * 0.42),
      width: width * (0.4 + rand() * 0.32), height: height * (0.13 + rand() * 0.11),
      phase: rand() * Math.PI * 2, alpha: 0.45 + rand() * 0.24 });
    return { width: width, height: height, padding: padding, particles: particles, veils: veils, counts: counts };
  }
  function windProfile(time, depth) {
    time = Number.isFinite(time) ? time : 0;
    depth = clamp(Number.isFinite(depth) ? depth : 0, 0, 1);
    // A slowly crossing pressure band links nearby snow; no independent random streak angles.
    return { speed: 0.94 + Math.sin(time * 0.29) * 0.15 + Math.sin(time * 0.63 - depth * 5.6) * 0.2,
      slope: 0.36 + Math.sin(time * 0.19 + depth * 2.4) * 0.04 };
  }
  function viewStrength(view) { return view === 'telemetry' ? 0.7 : 1; }
  function stepField(field, delta, time) {
    delta = clamp(Number.isFinite(delta) ? delta : 0, 0, MAX_DELTA);
    time = Number.isFinite(time) ? time : 0;
    var wrap = function (value, extent) {
      var total = extent + field.padding * 2;
      return ((value + field.padding) % total + total) % total - field.padding;
    };
    field.particles.forEach(function (p) {
      var speed = p.layer === 'powder' ? 110 : p.layer === 'streak' ? 280 : 600;
      var wind = windProfile(time, p.y / field.height);
      p.windSlope = wind.slope; p.gust = wind.speed;
      var lateralSpeed = speed * p.speed * wind.speed;
      var turbulence = p.layer === 'powder' ? Math.sin(time * 0.65 + p.phase) * 1.1 : 0;
      if (delta) {
        p.x = wrap(p.x - lateralSpeed * delta, field.width);
        p.y = wrap(p.y + (lateralSpeed * wind.slope + turbulence) * delta, field.height);
      }
    });
    return delta;
  }
  function tick(previous, now) {
    if (!Number.isFinite(now)) return { draw: false, delta: 0, last: previous };
    if (!Number.isFinite(previous)) return { draw: true, delta: 0, last: now };
    var elapsed = Math.max(0, now - previous);
    if (elapsed < FRAME_INTERVAL) return { draw: false, delta: 0, last: previous };
    return { draw: true, delta: Math.min(MAX_DELTA, elapsed / 1000), last: now };
  }
  function listen(target, name, callback, options) {
    if (target.addEventListener) {
      target.addEventListener(name, callback, options);
      return function () { target.removeEventListener(name, callback, options); };
    }
    if (name === 'change' && target.addListener) {
      target.addListener(callback); return function () { target.removeListener(callback); };
    }
    return function () {};
  }
  function create(options) {
    options = options || {};
    var win = options.window, doc = options.document || win && win.document;
    var host = options.host || doc && doc.getElementById('polarAtmosphere');
    var noop = { setView: function () {}, destroy: function () {}, state: function () { return { mode: 'unavailable' }; } };
    if (!win || !doc || !host) return noop;
    var canvas = options.canvas || doc.createElement('canvas'), context = canvas.getContext('2d', { alpha: true });
    if (!context) return noop;
    var owned = !options.canvas;
    canvas.className = 'atmosphere-canvas'; canvas.setAttribute('aria-hidden', 'true');
    if (owned) host.appendChild(canvas);
    var desktop = win.matchMedia('(min-width:769px)'), reduced = win.matchMedia('(prefers-reduced-motion: reduce)');
    var view = doc.body && doc.body.dataset.view || 'dashboard', destroyed = false, suspended = false;
    var animationFrame = 0, refreshFrame = 0, lastFrame = null, time = 0, field, width = 0, height = 0, dpr = 1;
    var cleanups = [], mode = 'disabled', maskTop = 0;
    function plumeSprite() {
      var surface = doc.createElement('canvas'); surface.width = 512; surface.height = 128;
      var paint = surface.getContext('2d');
      // Dense windward head and a long feathered wake, rather than circular white fog blobs.
      [[0.24, 0.56, 0.17, 0.3, 0.38], [0.49, 0.47, 0.31, 0.4, 0.24], [0.77, 0.56, 0.23, 0.29, 0.11]]
        .forEach(function (lobe) {
          paint.save(); paint.translate(surface.width * lobe[0], surface.height * lobe[1]);
          paint.scale(surface.width * lobe[2], surface.height * lobe[3]);
          var gradient = paint.createRadialGradient(0, 0, 0, 0, 0, 1);
          gradient.addColorStop(0, 'rgba(182,216,232,' + lobe[4] + ')');
          gradient.addColorStop(0.48, 'rgba(175,211,230,' + lobe[4] * 0.3 + ')');
          gradient.addColorStop(1, 'rgba(170,208,229,0)');
          paint.fillStyle = gradient; paint.fillRect(-1, -1, 2, 2); paint.restore();
        });
      return surface;
    }
    function crystalSprite(variant) {
      var surface = doc.createElement('canvas'); surface.width = surface.height = 32;
      var paint = surface.getContext('2d');
      // Uneven ice facets, never repeated snowflake icons or long rain-like strokes.
      var facets = [
        [[6, 13], [12, 5], [20, 9], [26, 19], [16, 25], [7, 21]],
        [[8, 7], [21, 10], [25, 17], [19, 25], [10, 23], [5, 15]],
        [[12, 5], [23, 9], [24, 21], [15, 26], [6, 18], [8, 11]]
      ][variant];
      paint.fillStyle = 'rgba(212,233,244,0.82)'; paint.beginPath();
      facets.forEach(function (point, index) {
        if (index) paint.lineTo(point[0], point[1]); else paint.moveTo(point[0], point[1]);
      });
      paint.closePath(); paint.fill();
      paint.fillStyle = 'rgba(246,251,255,0.72)'; paint.beginPath();
      paint.moveTo(facets[0][0], facets[0][1]); paint.lineTo(facets[1][0], facets[1][1]);
      paint.lineTo(17, 17); paint.closePath(); paint.fill();
      return surface;
    }
    function nearSnowSprite(variant) {
      var surface = doc.createElement('canvas'); surface.width = surface.height = 64;
      var paint = surface.getContext('2d');
      // The camera sees nearby powder out of focus: asymmetrical soft clusters, not giant dots.
      [[0.4, 0.45, 0.27, 0.76], [0.58, 0.55, 0.24, 0.54], [0.62, 0.32, 0.17, 0.26]]
        .forEach(function (lobe, index) {
          var x = 64 * (lobe[0] + (variant - 1) * (index === 1 ? 0.07 : -0.03));
          var y = 64 * (lobe[1] + (variant - 1) * (index === 2 ? 0.07 : 0.02));
          var gradient = paint.createRadialGradient(x, y, 0, x, y, 64 * lobe[2]);
          gradient.addColorStop(0, 'rgba(230,245,252,' + lobe[3] + ')');
          gradient.addColorStop(0.34, 'rgba(220,239,249,' + lobe[3] * 0.78 + ')');
          gradient.addColorStop(0.72, 'rgba(204,229,244,' + lobe[3] * 0.2 + ')');
          gradient.addColorStop(1, 'rgba(196,221,238,0)');
          paint.fillStyle = gradient; paint.fillRect(0, 0, 64, 64);
        });
      return surface;
    }
    // All blur kernels and gradients are cached once; the animation loop only composites sprites.
    var powderVeil = plumeSprite(), crystals = [0, 1, 2].map(crystalSprite), nearSnow = [0, 1, 2].map(nearSnowSprite);
    function resize() {
      var nextWidth = Math.max(1, Number(win.innerWidth) || 1440);
      var nextHeight = Math.max(1, Number(win.innerHeight) || 900);
      var nextDpr = pixelRatio(nextWidth, nextHeight, Number(win.devicePixelRatio), win.navigator);
      if (nextWidth === width && nextHeight === height && nextDpr === dpr) return;
      width = nextWidth; height = nextHeight; dpr = nextDpr;
      canvas.width = Math.max(1, Math.floor(width * dpr)); canvas.height = Math.max(1, Math.floor(height * dpr));
      canvas.style.width = width + 'px'; canvas.style.height = height + 'px';
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      host.dataset.atmosphereDpr = String(Math.round(dpr * 1000) / 1000);
      host.dataset.atmospherePixels = String(canvas.width * canvas.height);
      field = makeField(width, height, options.seed);
    }
    function updateMask() {
      var hero = view === 'dashboard' ? doc.querySelector('.field-hero') : null;
      maskTop = hero ? clamp(hero.getBoundingClientRect().bottom, 0, height) : 0;
      // A partially scrolled hero retains its own 3D weather; only the area below it receives this layer.
      canvas.style.clipPath = maskTop ? 'inset(' + Math.ceil(maskTop) + 'px 0 0 0)' : '';
    }
    function edgeWeight(p) {
      var edge = Math.pow(Math.abs(clamp(p.x / width, 0, 1) - 0.5) * 2, 0.8);
      var depth = 0.82 + 0.18 * Math.pow(clamp(p.y / height, 0, 1), 1.5);
      // Content remains quieter, but snow must not disappear across the entire center of the viewport.
      return (0.58 + 0.42 * edge) * depth;
    }
    function draw(still) {
      context.clearRect(0, 0, width, height);
      var intensity = viewStrength(view);
      field.veils.forEach(function (veil) {
        var x = still ? veil.x : ((veil.x + width * 0.175 - time * (16 + Math.sin(veil.phase) * 5)) % (width * 1.35) + width * 1.35) % (width * 1.35) - width * 0.175;
        var quietCenter = 0.33 + Math.abs(clamp(x / width, 0, 1) - 0.5) * 1.34;
        context.globalAlpha = veil.alpha * intensity * quietCenter;
        context.drawImage(powderVeil, x - veil.width / 2, veil.y - veil.height / 2, veil.width, veil.height);
      });
      context.fillStyle = '#d5e6ef';
      field.particles.forEach(function (p, index) {
        if (still && p.layer !== 'streak' && index % 2 !== 0) return;
        var strength = edgeWeight(p) * intensity;
        context.globalAlpha = p.alpha * strength * (0.7 + p.gust * 0.3);
        if (p.layer !== 'powder') {
          var tumble = still ? 1 : 0.82 + Math.sin(time * 0.8 + p.phase) * 0.18;
          var thickness = p.length * p.aspect * tumble;
          context.save(); context.translate(p.x, p.y);
          context.rotate(p.rotation + (still ? 0 : time * p.spin));
          context.drawImage(p.layer === 'near' ? nearSnow[p.variant] : crystals[p.variant],
            -p.length / 2, -thickness / 2, p.length, thickness);
          context.restore();
        } else {
          context.beginPath(); context.arc(p.x, p.y, p.radius, 0, Math.PI * 2); context.fill();
        }
      });
      context.globalAlpha = 1;
    }
    function stop() {
      if (animationFrame) win.cancelAnimationFrame(animationFrame);
      animationFrame = 0; lastFrame = null;
    }
    function animate(timestamp) {
      animationFrame = 0;
      if (destroyed || suspended || doc.hidden || !desktop.matches || reduced.matches || mode !== 'animated') return;
      var clock = tick(lastFrame, timestamp);
      if (clock.draw) {
        lastFrame = clock.last; time += stepField(field, clock.delta, time); draw(false);
      }
      animationFrame = win.requestAnimationFrame(animate);
    }
    function refresh() {
      refreshFrame = 0;
      if (destroyed) return;
      resize(); updateMask();
      var visible = !suspended && !doc.hidden && desktop.matches && maskTop < height;
      if (!visible) {
        stop(); canvas.hidden = true;
        mode = !desktop.matches ? 'disabled' : maskTop >= height ? 'hero' : 'paused';
      } else {
        canvas.hidden = false;
        if (reduced.matches) { stop(); mode = 'static'; draw(true); }
        else { mode = 'animated'; if (!animationFrame) animationFrame = win.requestAnimationFrame(animate); }
      }
      host.dataset.atmosphere = mode;
    }
    function queueRefresh() {
      if (destroyed || suspended || doc.hidden || refreshFrame) return;
      refreshFrame = win.requestAnimationFrame(refresh);
    }
    function visibility() {
      if (doc.hidden) {
        stop(); if (refreshFrame) win.cancelAnimationFrame(refreshFrame); refreshFrame = 0;
      }
      refresh();
    }
    cleanups.push(listen(win, 'resize', queueRefresh, { passive: true }));
    cleanups.push(listen(win, 'scroll', queueRefresh, { passive: true }));
    cleanups.push(listen(doc, 'visibilitychange', visibility));
    cleanups.push(listen(win, 'pagehide', function () {
      suspended = true; stop(); if (refreshFrame) win.cancelAnimationFrame(refreshFrame); refreshFrame = 0; refresh();
    }));
    cleanups.push(listen(win, 'pageshow', function () { suspended = false; refresh(); }));
    cleanups.push(listen(desktop, 'change', refresh));
    cleanups.push(listen(reduced, 'change', refresh));
    refresh();
    return {
      setView: function (next) { if (destroyed) return; view = String(next || 'dashboard'); refresh(); },
      destroy: function () {
        if (destroyed) return; destroyed = true; stop();
        if (refreshFrame) win.cancelAnimationFrame(refreshFrame); refreshFrame = 0;
        cleanups.forEach(function (cleanup) { cleanup(); }); cleanups = [];
        if (owned) canvas.remove(); else { context.clearRect(0, 0, width, height); canvas.hidden = true; }
        mode = 'destroyed'; host.dataset.atmosphere = mode; field = null;
      },
      state: function () { return { mode: mode, dpr: dpr, width: width, height: height,
        maskTop: maskTop, count: field ? field.particles.length : 0, strength: viewStrength(view), time: time, destroyed: destroyed }; }
    };
  }
  return { create: create, makeField: makeField, stepField: stepField, tick: tick, windProfile: windProfile, viewStrength: viewStrength, pixelRatio: pixelRatio,
    limits: { fps: 30, maxDelta: MAX_DELTA, maxDpr: MAX_DPR, maxPixels: MAX_PIXELS, lowPixels: LOW_PIXELS, maxParticles: 700 } };
});
