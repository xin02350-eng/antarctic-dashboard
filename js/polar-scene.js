/* Real-time single-mast polar scene. Telemetry stays in observatory.js. */
(function () {
  'use strict';
  var host = document.getElementById('polarScene'), fallback = document.getElementById('sceneFallback');
  if (!host) return;
  var startupClock = typeof performance !== 'undefined' ? function () { return performance.now(); } : function () { return 0; };
  host.dataset.runtimeStartMs = startupClock().toFixed(1);
  var cameraProfile = new URLSearchParams(window.location.search).get('profile');
  document.documentElement.dataset.profile = cameraProfile === 'hero' || cameraProfile === 'instrument' ? cameraProfile : 'standard';
  var publishedReadyState = null, firstFrameRendered = false, panoramaSettled = false, environmentSettled = false, environmentFailed = false, sceneInitialized = false;
  var quality = window.PolarRenderBudget ? window.PolarRenderBudget.create({ navigator: window.navigator, mode: 'field' }) : {
    profile: function () { return { tier: 'balanced', shadowSize: 1024, particleScale: 1, terrainSegments: 192 }; },
    pixelRatio: function (w,h,dpr) { return Math.min(dpr || 1,1.5,Math.sqrt(2000000/(Math.max(1,w)*Math.max(1,h)))); },
    sample: function () { return false; }, reset: function () {}
  };
  host.dataset.renderQuality = quality.profile().tier;
  function publishReady(state) {
    if (host.dataset.readyState !== state) host.dataset.readyState = state;
    if (!host.dataset.visibleFrameMs && state !== 'unavailable') host.dataset.visibleFrameMs = startupClock().toFixed(1);
    if (cameraProfile !== 'hero' || window.parent === window || publishedReadyState === state) return;
    publishedReadyState = state;
    window.parent.postMessage({ type: 'dms:field-ready', state: state }, window.location.origin);
  }
  function publishEnvironmentState() {
    // Reveal one complete material state, never an untextured device that refines in view.
    if (!firstFrameRendered || !panoramaSettled || contextLost) return;
    if (environment.presentationReady && !environment.presentationReady()) return;
    var failed = environmentFailed || !!(environment.degraded && environment.degraded());
    var qualityState = failed ? 'degraded' : 'ready';
    if (host.dataset.qualityState !== qualityState) host.dataset.qualityState = qualityState;
    if (failed || host.dataset.environment === 'ready') publishReady(failed ? 'degraded' : 'ready');
  }
  var T = window.THREE, renderer;
  try {
    if (!T || !window.createPolarPower || !window.createPolarMast || !window.createPolarSnow || !window.PolarEnvironment) throw new Error('3D runtime unavailable');
    try { renderer = new T.WebGLRenderer({ antialias: quality.profile().tier !== 'low', powerPreference: 'high-performance' }); }
    catch (preferredError) { renderer = new T.WebGLRenderer({ antialias: false }); }
  } catch (error) {
    fallback.hidden = false;
    publishReady('unavailable');
    document.querySelectorAll('.view-controls button, #motionToggle').forEach(function (button) { button.disabled = true; }); return;
  }
  renderer.setPixelRatio(quality.pixelRatio(window.innerWidth, window.innerHeight, window.devicePixelRatio));
  renderer.outputEncoding = T.sRGBEncoding; renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.88;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false; renderer.shadowMap.needsUpdate = true;
  host.appendChild(renderer.domElement);
  var scene = new T.Scene(); scene.background = new T.Color(0x283c51); scene.fog = new T.FogExp2(new T.Color(0x929fac).convertSRGBToLinear(), 0.014);
  var camera = new T.PerspectiveCamera(36, 1, 0.1, 600);
  scene.add(new T.HemisphereLight(0xc2d3e5, 0x202e3b, 0.44));
  var sun = new T.DirectionalLight(0xe4ebf3, 1.35); sun.position.set(-5, 12, -10); sun.castShadow = true;
  sun.shadow.mapSize.set(quality.profile().shadowSize, quality.profile().shadowSize); Object.assign(sun.shadow.camera, { left: -8, right: 8, top: 12, bottom: -8, near: 0.5, far: 55 });
  sun.shadow.bias = -0.00015; sun.shadow.normalBias = 0.008; sun.shadow.radius = 2; scene.add(sun);
  var rim = new T.DirectionalLight(0xc6d7e4, 1.02); rim.position.set(6, 5, -10); scene.add(rim);
  // A cool sky-side bounce separates the two front faces without turning the storm into daylight.
  var fill = new T.DirectionalLight(0xc4d4e2, 0.58); fill.position.set(3, 8, 10); scene.add(fill);
  function mat(hex, metalness, roughness) { return new T.MeshStandardMaterial({ color: new T.Color(hex).convertSRGBToLinear(), metalness: metalness, roughness: roughness, envMapIntensity: 0.75 }); }
  var m = { white: mat(0xcbd3d7, 0.04, 0.54), silver: mat(0xc5cfd7, 0.88, 0.38), dark: mat(0x162029, 0.34, 0.48),
    rubber: mat(0x101923, 0.04, 0.88), orange: mat(0xbe7746, 0.35, 0.48), frost: mat(0xb9c9dc, 0.01, 0.96), trace: mat(0x8ba3b7, 0.72, 0.4) };
  m.white.envMapIntensity = 0.50; m.silver.envMapIntensity = 1.12; m.trace.envMapIntensity = 0.90;
  m.cups = m.dark.clone(); m.cups.side = T.DoubleSide;
  m.cell = new T.MeshPhysicalMaterial({ color: 0xffffff, metalness: 0.12, roughness: 0.24, clearcoat: 0.82, clearcoatRoughness: 0.22, envMapIntensity: 1.25 });
  m.glow = new T.MeshStandardMaterial({ color: 0xaff6ec, emissive: 0x6bddcb, emissiveIntensity: 1.4, roughness: 0.35 });
  var randomSeed = 2619;
  function random() { randomSeed = (randomSeed * 1664525 + 1013904223) >>> 0; return randomSeed / 4294967296; }
  // Manufacturing finish, with microscopic roughness variation.
  var wearCanvas = document.createElement('canvas'); wearCanvas.width = wearCanvas.height = 256;
  // Roughness maps multiply the scalar roughness. Keep the base near one, not middle gray,
  // so painted alloy remains powder-coated and metal reflects broad storm-cloud highlights.
  var wearContext = wearCanvas.getContext('2d'); wearContext.fillStyle = '#e9e9e9'; wearContext.fillRect(0, 0, 256, 256);
  for (var i = 0; i < 1400; i++) {
    var grey = 180 + Math.floor(random() * 65), x = random() * 256, y = random() * 256;
    wearContext.strokeStyle = 'rgba(' + grey + ',' + grey + ',' + grey + ',.15)';
    wearContext.beginPath(); wearContext.moveTo(x, y); wearContext.lineTo(x + random() * 45, y + 0.15); wearContext.stroke();
  }
  var wearTexture = new T.CanvasTexture(wearCanvas); wearTexture.wrapS = wearTexture.wrapT = T.RepeatWrapping; wearTexture.repeat.set(3, 3);
  [m.white, m.silver, m.dark].forEach(function (material) { material.roughnessMap = wearTexture; material.bumpMap = wearTexture; });
  m.white.bumpScale = 0.00025; m.silver.bumpScale = 0.0008; m.dark.bumpScale = 0.0006;
  var decalCanvas = document.createElement('canvas'); decalCanvas.width = 512; decalCanvas.height = 160;
  var decalContext = decalCanvas.getContext('2d'), decalTexture = new T.CanvasTexture(decalCanvas); decalTexture.encoding = T.sRGBEncoding;
  function setDecal(name) {
    decalContext.fillStyle = '#cbd6e0'; decalContext.fillRect(0, 0, 512, 160);
    decalContext.fillStyle = '#20364a'; decalContext.font = 'bold 72px Arial'; decalContext.fillText(name, 24, 82);
    decalContext.font = '18px monospace'; decalContext.fillText('POLAR AUTONOMOUS OBSERVATORY', 26, 127); decalTexture.needsUpdate = true;
  }
  setDecal('DMS–A01'); m.decal = new T.MeshStandardMaterial({ map: decalTexture, roughness: 0.72 });
  var model = window.createPolarMast(T, m, function (three, materials) {
    return window.createPolarPower(three, materials, { renderer: renderer });
  }, window.PolarEnvironment.heightAt), station = model.group;
  scene.add(station);
  var snowDepositMaterial = mat(0xe3edf5, 0.0, 0.96);
  snowDepositMaterial.vertexColors = true;
  snowDepositMaterial.onBeforeCompile = function (shader) {
    shader.vertexShader = 'varying vec3 snowLocal;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nsnowLocal=position;');
    shader.fragmentShader = 'varying vec3 snowLocal;float snowGrain(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\nfloat grain=snowGrain(floor(snowLocal*310.));diffuseColor.rgb*=.87+grain*.17;');
  };
  snowDepositMaterial.envMapIntensity = 0.20;
  window.createPolarSnow(T, model, snowDepositMaterial);
  // The stationary structure casts one cached shadow. The small measuring cups
  // remain animated, without repeatedly rerendering every static shadow caster.
  model.cups.traverse(function (part) { if (part.isMesh) part.castShadow = false; });
  if (window.PolarBatch) {
    var batch = window.PolarBatch.compact(T, station, { exclude: [model.cups] });
    host.dataset.modelDrawsBefore = String(batch.before); host.dataset.modelDrawsAfter = String(batch.after);
  }
  var environmentNote = document.getElementById('environmentStatus');
  var environment = window.PolarEnvironment.create(T, renderer, scene, function (resources) {
    firstFrameRendered = false;
    host.dataset.environment = resources.panorama === 'ready' && resources.snow === 'ready' && resources.crust === 'ready' ? 'ready' : 'loading';
    var failed = resources.panorama === 'error' || resources.snow === 'error' || resources.crust === 'error';
    panoramaSettled = resources.panorama !== 'loading'; environmentFailed = failed;
    environmentSettled = resources.panorama !== 'loading' && resources.snow !== 'loading' && resources.crust !== 'loading';
    if (failed) host.dataset.environment = 'degraded';
    publishEnvironmentState();
    if (environmentNote) {
      environmentNote.hidden = host.dataset.environment === 'ready';
      environmentNote.dataset.zh = failed ? '环境素材未完整加载，三维操作与数据仍可使用' : '正在加载极地环境…';
      environmentNote.dataset.en = failed ? 'Environment partially unavailable. Controls and data remain accessible.' : 'Loading polar environment…';
      environmentNote.textContent = document.documentElement.dataset.language === 'en' ? environmentNote.dataset.en : environmentNote.dataset.zh;
    }
    requestFrame();
  }, snowDepositMaterial, { quality: quality.profile() });
  if (environment.prepare) environment.prepare();
  function mesh(geometry, material, parent, point) {
    var object = new T.Mesh(geometry, material); if (point) object.position.copy(point); (parent || scene).add(object); return object;
  }
  var signals = new T.Group(); signals.name = 'schematic-communications'; station.add(signals);
  var antenna = model.anchors.antenna, rings = [], paths = [], packets = [];
  for (i = 0; i < 3; i++) {
    var ring = mesh(new T.TorusGeometry(1, 0.009, 6, 100), new T.MeshBasicMaterial({ color: 0x9bdcdf, transparent: true, opacity: 0.35, depthWrite: false }), signals, antenna);
    ring.rotation.x = Math.PI / 2; rings.push(ring);
  }
  [[-28, 1.2, -38], [33, 1.4, -47]].forEach(function (end, index) {
    var curve = new T.QuadraticBezierCurve3(antenna.clone(), new T.Vector3(end[0] * 0.46, 14, end[2] * 0.46), new T.Vector3().fromArray(end)); paths.push(curve);
    signals.add(new T.Line(new T.BufferGeometry().setFromPoints(curve.getPoints(100)), new T.LineBasicMaterial({ color: 0x9dd7df, transparent: true, opacity: 0.075 })));
    packets.push(mesh(new T.SphereGeometry(0.045, 8, 8), new T.MeshBasicMaterial({ color: index ? 0xc4e9e5 : 0xa4f1e5 }), signals));
  });
  // Acquisition perimeter follows the terrain; there is no circular raised stage.
  var perimeterPoints = [];
  for (i = 0; i < 160; i++) {
    var a = i / 159 * Math.PI * 2;
    x = Math.cos(a) * 3.8; var z = Math.sin(a) * 3.8;
    perimeterPoints.push(new T.Vector3(x, window.PolarEnvironment.heightAt(x, z) + 0.025, z));
  }
  var perimeter = new T.Line(new T.BufferGeometry().setFromPoints(perimeterPoints), new T.LineDashedMaterial({ color: 0x93c7d8, transparent: true, opacity: 0.08, dashSize: 0.16, gapSize: 0.30 }));
  perimeter.computeLineDistances(); signals.add(perimeter);
  var scanPositions = new Float32Array(24 * 3), scanColors = new Float32Array(24 * 3);
  for (i = 0; i < 24; i++) { scanColors[i * 3] = 0.35 + i / 36; scanColors[i * 3 + 1] = 0.45 + i / 44; scanColors[i * 3 + 2] = 0.50 + i / 48; }
  var scanGeometry = new T.BufferGeometry(); scanGeometry.setAttribute('position', new T.BufferAttribute(scanPositions, 3)); scanGeometry.setAttribute('color', new T.BufferAttribute(scanColors, 3));
  var scan = new T.Line(scanGeometry, new T.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.24, depthWrite: false })); scan.frustumCulled = false; signals.add(scan);
  // Airborne crystals and low-altitude blowing snow are batched in two draw calls.
  var dot = document.createElement('canvas'); dot.width = dot.height = 32;
  var context = dot.getContext('2d'), gradient = context.createRadialGradient(16, 16, 0, 16, 16, 16);
  gradient.addColorStop(0, '#ffffff'); gradient.addColorStop(0.18, '#ffffffa0'); gradient.addColorStop(1, '#ffffff00'); context.fillStyle = gradient; context.fillRect(0, 0, 32, 32);
  var particleTexture = new T.CanvasTexture(dot), particlePositions = new Float32Array(2600 * 3);
  for (i = 0; i < particlePositions.length; i += 3) { particlePositions[i] = (random() - 0.5) * 70; particlePositions[i + 1] = random() * 13; particlePositions[i + 2] = (random() - 0.5) * 70; }
  var particleGeometry = new T.BufferGeometry(); particleGeometry.setAttribute('position', new T.BufferAttribute(particlePositions, 3));
  scene.add(new T.Points(particleGeometry, new T.PointsMaterial({ color: 0xd6e9fa, size: 0.095, map: particleTexture, transparent: true, opacity: 0.56, depthWrite: false })));
  // Directional snow streaks occupy real world space and remain occluded by the instrument.
  var streakPositions = new Float32Array(1200 * 6), streakSeeds = new Float32Array(1200 * 4);
  for (i = 0; i < 1200; i++) {
    streakSeeds[i * 4] = (random() - 0.5) * 58; streakSeeds[i * 4 + 1] = random() * 18;
    streakSeeds[i * 4 + 2] = (random() - 0.5) * 58; streakSeeds[i * 4 + 3] = 0.18 + random() * 0.52;
  }
  var streakGeometry = new T.BufferGeometry(); streakGeometry.setAttribute('position', new T.BufferAttribute(streakPositions, 3));
  var streaks = new T.LineSegments(streakGeometry, new T.LineBasicMaterial({ color: 0xd9e7f4, transparent: true, opacity: 0.32, depthWrite: false }));
  streaks.frustumCulled = false; scene.add(streaks);
  var driftPositions = new Float32Array(360 * 3);
  for (i = 0; i < driftPositions.length; i += 3) { driftPositions[i] = (random() - 0.5) * 44; driftPositions[i + 2] = (random() - 0.5) * 44; driftPositions[i + 1] = environment.heightAt(driftPositions[i], driftPositions[i + 2]) + 0.15; }
  var driftGeometry = new T.BufferGeometry(); driftGeometry.setAttribute('position', new T.BufferAttribute(driftPositions, 3));
  scene.add(new T.Points(driftGeometry, new T.PointsMaterial({ color: 0xaccce6, size: 1.3, map: particleTexture, transparent: true, opacity: 0.16, depthWrite: false })));

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)'), paused = reduced.matches, showSignals = true;
  var composition = window.PolarCamera && window.PolarCamera.profile(cameraProfile, window.innerWidth, window.innerHeight);
  var presets = composition ? composition.presets : { wide: { azimuth: 0.65, elevation: 0.10, radius: 19.8, targetY: 3.15 },
    close: { azimuth: 0.77, elevation: 0.16, radius: 15.8, targetY: 3.25 },
    top: { azimuth: 0.72, elevation: 0.86, radius: 19.8, targetY: 3.15 } };
  host.dataset.cameraProfile = composition ? composition.name : 'standard';
  var selectedPreset = 'wide';
  var current = Object.assign({}, presets.wide), destination = Object.assign({}, presets.wide), detailMode = false;
  var lookAt = new T.Vector3(), dragging = false, pointerX = 0, pointerY = 0;
  function resize() {
    var w = window.innerWidth, h = window.innerHeight;
    var offset = Number(host.dataset.horizontalOffset || 0.065);
    var verticalOffset = -0.015;
    if (composition && (composition.name === 'hero' || composition.name === 'instrument')) {
      composition = window.PolarCamera.profile(cameraProfile, w, h); presets = composition.presets;
      offset = composition.horizontalOffset; verticalOffset = composition.verticalOffset;
      if (selectedPreset) destination = Object.assign({}, presets[selectedPreset]);
    }
    camera.aspect = w / h; camera.setViewOffset(w, h, -w * offset, h * verticalOffset, w, h); camera.updateProjectionMatrix();
    renderer.setPixelRatio(quality.pixelRatio(w,h,window.devicePixelRatio)); renderer.setSize(w, h);
    requestFrame();
  }
  window.addEventListener('resize', resize); resize();
  function clearPreset() { selectedPreset = null; document.querySelectorAll('[data-view]').forEach(function (button) { button.setAttribute('aria-pressed', 'false'); }); }
  var touchControls = window.SceneTouch && (document.documentElement.dataset.client === 'mobile' || /(?:^|[?&])client=mobile(?:&|$)/.test(window.location.search)) ? window.SceneTouch.create(renderer.domElement, {
    active: function (active) { dragging = active; quality.reset(); requestFrame(); },
    rotate: function (dx, dy) {
      if (Math.abs(dx) + Math.abs(dy) > 1) clearPreset();
      destination.azimuth -= dx * 0.006;
      destination.elevation = Math.max(0.03, Math.min(1.20, destination.elevation + dy * 0.004)); requestFrame();
    },
    zoom: function (ratio) { clearPreset(); destination.radius = Math.max(11, Math.min(32, destination.radius * ratio)); requestFrame(); }
  }) : null;
  renderer.domElement.addEventListener('pointerdown', function (event) {
    if (touchControls && touchControls.down(event)) return;
    if (event.button !== 0) return;
    dragging = true; pointerX = event.clientX; pointerY = event.clientY;
    try { if (renderer.domElement.setPointerCapture) renderer.domElement.setPointerCapture(event.pointerId); } catch (captureError) { /* Window exit events release older pointer implementations. */ }
    requestFrame();
  });
  renderer.domElement.addEventListener('pointermove', function (event) {
    if (touchControls && touchControls.move(event)) return;
    if (!dragging) return;
    if (Math.abs(event.clientX - pointerX) + Math.abs(event.clientY - pointerY) > 1) clearPreset();
    destination.azimuth -= (event.clientX - pointerX) * 0.006;
    destination.elevation = Math.max(0.03, Math.min(1.20, destination.elevation + (event.clientY - pointerY) * 0.004));
    pointerX = event.clientX; pointerY = event.clientY;
    requestFrame();
  });
  function endDrag(event) {
    if (touchControls) {
      if (!event || event.type === 'blur') touchControls.clear();
      else if (touchControls.up(event)) return;
    }
    dragging = false;
  }
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (type) { renderer.domElement.addEventListener(type, endDrag); });
  ['pointerup', 'pointercancel', 'blur'].forEach(function (type) { window.addEventListener(type, endDrag); });
  renderer.domElement.addEventListener('wheel', function (event) {
    if (composition && composition.name === 'hero' && !event.shiftKey) {
      // The immersive canvas is also the page surface. Do not trap ordinary scrolling.
      if (window.parent !== window) {
        event.preventDefault();
        var delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? window.innerHeight : 1);
        window.parent.postMessage({ type: 'dms:field-scroll', deltaY: delta }, window.location.origin);
      }
      return;
    }
    event.preventDefault(); clearPreset(); destination.radius = Math.max(11, Math.min(32, destination.radius + event.deltaY * 0.012)); requestFrame();
  }, { passive: false });
  document.querySelectorAll('[data-view]').forEach(function (button) {
    button.addEventListener('click', function () { selectedPreset = button.dataset.view; destination = Object.assign({}, presets[selectedPreset]);
      detailMode = button.dataset.view === 'close';
      document.querySelectorAll('[data-view]').forEach(function (item) { item.setAttribute('aria-pressed', String(item === button)); });
      requestFrame();
    });
  });
  var motionButton = document.getElementById('motionToggle');
  function publishMotion() { if (motionButton) motionButton.setAttribute('aria-pressed', String(paused)); window.dispatchEvent(new CustomEvent('polar:motion', { detail: { paused: paused } })); }
  publishMotion(); if (motionButton) motionButton.addEventListener('click', function () { paused = !paused; publishMotion(); requestFrame(); });
  function motionPreference(event) { paused = event.matches; publishMotion(); requestFrame(); }
  if (reduced.addEventListener) reduced.addEventListener('change', motionPreference);
  else if (reduced.addListener) reduced.addListener(motionPreference);
  window.addEventListener('polar:station', function (event) { setDecal('DMS–' + event.detail.toUpperCase()); requestFrame(); });
  var labels = [ ['antennaLabel', model.anchors.antenna, true], ['sensorLabel', model.anchors.sensor, false], ['powerLabel', model.anchors.solar, false] ];
  function positionLabels() {
    if (cameraProfile === 'hero' || cameraProfile === 'instrument') return;
    labels.forEach(function (entry) {
      var element = document.getElementById(entry[0]), p = station.localToWorld(entry[1].clone()).project(camera);
      var x = (p.x + 1) * window.innerWidth / 2, y = (1 - p.y) * window.innerHeight / 2;
      var visible = detailMode && p.z < 1 && x > innerWidth * 0.40 && x < innerWidth * 0.72 && y > 120 && y < innerHeight - 180;
      var opacity = visible && (!entry[2] || showSignals) ? '1' : '0';
      if (element.style.opacity !== opacity) element.style.opacity = opacity;
      if (visible) { element.style.left = x.toFixed(1) + 'px'; element.style.top = y.toFixed(1) + 'px'; }
    });
  }
  var time = 0, lastFrame = 0, lastTick = 0, raf = 0, contextLost = false;
  var needsFrame = true, weatherPainted = false, statsStart = 0, statsFrames = 0;
  var activity = window.PolarCamera && window.PolarCamera.visibilityGate(window.location.origin, window.parent);
  if (activity) activity.page(!document.hidden);
  function canRender() { return !document.hidden && !contextLost && (!activity || activity.active()); }
  function requestFrame() { needsFrame = true; if (sceneInitialized && canRender() && !raf) raf = requestAnimationFrame(frame); }
  function updateActivity() {
    host.dataset.runtimeActive = String(canRender());
    if (!canRender()) { if (touchControls) touchControls.clear(); cancelAnimationFrame(raf); raf = 0; lastFrame = lastTick = 0; statsStart = statsFrames = 0; dragging = false; quality.reset(); }
    else if (!raf) { lastFrame = 0; raf = requestAnimationFrame(frame); }
  }
  window.addEventListener('message', function (event) {
    if (activity && activity.message(event)) updateActivity();
  });
  function frame(now) {
    raf = 0;
    if (!canRender()) { raf = 0; lastFrame = 0; return; }
    // Do not compile an invisible, untextured sky program and immediately replace it.
    if (!panoramaSettled) return; // Resource completion/timeout wakes one frame; no empty polling loop.
    // Finish reflection before the first visible render. Pending downloads wake us
    // through their callbacks instead of keeping an invisible animation loop alive.
    if (environment.afterFrame) environment.afterFrame();
    if (environment.presentationReady ? !environment.presentationReady() : !environmentSettled && !environmentFailed) return;
    var elapsed = lastTick ? now - lastTick : 1000 / 60;
    var frameInterval = 1000 / (quality.profile().maxFps || 60);
    if (lastTick && elapsed < frameInterval - .75) { raf = requestAnimationFrame(frame); return; }
    lastTick = elapsed >= frameInterval ? now - elapsed % frameInterval : now;
    needsFrame = false;
    if (lastFrame && !paused && quality.sample(now-lastFrame, now)) {
      host.dataset.renderQuality = quality.profile().tier;
      renderer.setPixelRatio(quality.pixelRatio(window.innerWidth,window.innerHeight,window.devicePixelRatio));
      renderer.setSize(window.innerWidth,window.innerHeight);
      sun.shadow.mapSize.set(quality.profile().shadowSize,quality.profile().shadowSize);
      if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
      renderer.shadowMap.needsUpdate = true;
    }
    var dt = lastFrame ? Math.min((now - lastFrame) / 1000, 0.05) : 0; lastFrame = now;
    if (!paused) time += dt;
    var smoothing = reduced.matches ? 1 : 1 - Math.exp(-dt * 5);
    Object.keys(current).forEach(function (key) { current[key] += (destination[key] - current[key]) * smoothing; });
    var drift = paused || dragging ? 0 : Math.sin(time * 0.07) * 0.009;
    camera.position.set(Math.sin(current.azimuth + drift) * Math.cos(current.elevation) * current.radius, Math.sin(current.elevation) * current.radius + current.targetY, Math.cos(current.azimuth + drift) * Math.cos(current.elevation) * current.radius);
    lookAt.set(0, current.targetY, 0); camera.lookAt(lookAt); camera.updateMatrixWorld();
    environment.update(time, camera);
    var gust = 1 + 0.22 * Math.sin(time * 0.63) + 0.13 * Math.sin(time * 1.37);
    var particleScale = quality.profile().particleScale;
    var snowCount = Math.round(1200 * particleScale), powderCount = Math.round(2600 * particleScale), driftCount = Math.round(360 * particleScale);
    if (!paused || !weatherPainted) for (var snowIndex = 0; snowIndex < snowCount; snowIndex++) {
      var seed = snowIndex * 4, offset = snowIndex * 6, length = streakSeeds[seed + 3];
      var sx = ((streakSeeds[seed] + time * 11 + 29) % 58) - 29;
      var sy = ((streakSeeds[seed + 1] - time * 1.9) % 18 + 18) % 18;
      var sz = ((streakSeeds[seed + 2] + time * 2.4 + 29) % 58) - 29;
      streakPositions[offset] = sx; streakPositions[offset + 1] = sy; streakPositions[offset + 2] = sz;
      streakPositions[offset + 3] = sx - length * gust; streakPositions[offset + 4] = sy + length * 0.17; streakPositions[offset + 5] = sz - length * 0.22;
    }
    streakGeometry.setDrawRange(0, snowCount * 2);
    particleGeometry.setDrawRange(0, powderCount); driftGeometry.setDrawRange(0, driftCount);
    if (!paused || !weatherPainted) streakGeometry.attributes.position.needsUpdate = true;
    if (!paused || !weatherPainted) {
      model.cups.rotation.y = time * 0.85;
      m.glow.emissiveIntensity = 1.3 + Math.sin(time * 1.6) * 0.25;
      rings.forEach(function (ring, index) {
        var phase = (time * 0.23 + index / rings.length) % 1; ring.scale.setScalar(0.1 + phase * 1.8);
        ring.position.y = antenna.y + phase * 0.55; ring.material.opacity = Math.sin(phase * Math.PI) * (1 - phase) * 0.24;
      });
      packets.forEach(function (packet, index) { var t = (time * 0.10 + index * 0.5) % 1; packet.position.copy(paths[index].getPoint(index ? 1 - t : t)); });
      for (var sample = 0; sample < 24; sample++) {
        var scanAngle = time * 0.25 - (23 - sample) * 0.023, scanX = Math.cos(scanAngle) * 3.8, scanZ = Math.sin(scanAngle) * 3.8;
        scanGeometry.attributes.position.setXYZ(sample, scanX, environment.heightAt(scanX, scanZ) + 0.034, scanZ);
      }
      scanGeometry.attributes.position.needsUpdate = true;
      for (var j = 0; j < powderCount * 3; j += 3) {
        particlePositions[j] += dt * 11 * gust; particlePositions[j + 1] -= dt * 1.9; particlePositions[j + 2] += dt * 2.4;
        if (particlePositions[j] > 35) particlePositions[j] = -35;
        if (particlePositions[j + 1] < 0) particlePositions[j + 1] = 13;
        if (particlePositions[j + 2] > 35) particlePositions[j + 2] = -35;
      }
      particleGeometry.attributes.position.needsUpdate = true;
      for (j = 0; j < driftCount * 3; j += 3) {
        driftPositions[j] += dt * 8.5 * gust; if (driftPositions[j] > 22) driftPositions[j] = -22;
        driftPositions[j + 1] = environment.heightAt(driftPositions[j], driftPositions[j + 2]) + 0.22 + Math.sin(time * 0.7 + j) * 0.08;
      }
      driftGeometry.attributes.position.needsUpdate = true;
      weatherPainted = true;
    }
    positionLabels();
    try { renderer.render(scene, camera); }
    catch (renderError) {
      contextLost = true; firstFrameRendered = false;
      if (activity) activity.context(false);
      updateActivity(); fallback.hidden = false; publishReady('unavailable');
      document.querySelectorAll('.view-controls button').forEach(function (button) { button.disabled = true; });
      return;
    }
    if (!host.dataset.firstDrawMs) host.dataset.firstDrawMs = startupClock().toFixed(1);
    firstFrameRendered = true; publishEnvironmentState();
    if (host.dataset.qualityState === 'ready' && !host.dataset.fullQualityMs) host.dataset.fullQualityMs = startupClock().toFixed(1);
    if (!statsStart) statsStart = now; else statsFrames++;
    if (now-statsStart>=1000) {
      host.dataset.renderFps = (statsFrames*1000/(now-statsStart)).toFixed(1);
      if (renderer.info) host.dataset.renderCalls = String(renderer.info.render.calls);
      statsFrames=0;statsStart=now;
    }
    var moving = Object.keys(current).some(function (key) { return Math.abs(current[key]-destination[key]) > .0005; });
    if (!raf && (!paused || moving || needsFrame || environment.pendingWork && environment.pendingWork())) raf = requestAnimationFrame(frame);
  }
  renderer.domElement.addEventListener('webglcontextlost', function (event) { event.preventDefault(); contextLost = true; firstFrameRendered = false; if (activity) activity.context(false); updateActivity(); fallback.hidden = false; publishReady('unavailable'); });
  renderer.domElement.addEventListener('webglcontextrestored', function () { environment.restore(); contextLost = false; if (activity) activity.context(true); fallback.hidden = true; document.querySelectorAll('.view-controls button').forEach(function (button) { button.disabled = false; }); renderer.shadowMap.needsUpdate = true; updateActivity(); });
  document.addEventListener('visibilitychange', function () { if (activity) activity.page(!document.hidden); updateActivity(); });
  window.addEventListener('pagehide', function () { if (activity) activity.page(false); updateActivity(); });
  window.addEventListener('pageshow', function () { if (activity) activity.page(!document.hidden); updateActivity(); });
  sceneInitialized = true; updateActivity();
})();
