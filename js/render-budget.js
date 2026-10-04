/* Shared GPU pixel budget. Real sustained frame pressure lowers quality, never functionality. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    root.PolarRenderBudget = api;
    if (api.isMobile({ environment: root }) && root.document && root.document.documentElement) root.document.documentElement.setAttribute('data-client', 'mobile');
  }
})(typeof window === 'undefined' ? globalThis : window, function () {
  'use strict';
  var profiles = {
    balanced: { tier: 'balanced', maxDpr: 1.5, maxPixels: 2000000, maxFps: 60, shadowSize: 1024, particleScale: 1, terrainSegments: 192 },
    low: { tier: 'low', maxDpr: 1, maxPixels: 1100000, maxFps: 60, shadowSize: 512, particleScale: .5, terrainSegments: 128 },
    economy: { tier: 'economy', maxDpr: .8, maxPixels: 650000, maxFps: 30, shadowSize: 256, particleScale: .3, terrainSegments: 96 }
  };
  function positive(value, fallback) { return Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : fallback; }
  function isMobile(options) {
    options = options || {};
    var environment = options.environment || (typeof window !== 'undefined' ? window : {});
    var device = options.navigator || environment.navigator || {};
    var query = /(?:^|[?&])client=([^&]*)/.exec(environment.location && environment.location.search || '');
    var client = options.client || query && query[1];
    if (client === 'mobile') return true;
    if (client === 'desktop') return false;
    // A phone/tablet iframe may be wider than the old desktop breakpoint when
    // held sideways. Physical CSS screen bounds, not iframe height, identify it.
    var screen = environment.screen || {};
    var width = positive(screen.width, positive(environment.innerWidth, Infinity));
    var height = positive(screen.height, positive(environment.innerHeight, Infinity));
    var coarse = false;
    try { coarse = !!(environment.matchMedia && environment.matchMedia('(pointer: coarse)').matches); } catch (error) {}
    return Number(device.maxTouchPoints) > 0 && coarse && Math.min(width, height) <= 1024;
  }
  function create(options) {
    options = options || {};
    var environment = options.environment || (typeof window !== 'undefined' ? window : {});
    var device = options.navigator || environment.navigator || {}, memory = Number(device.deviceMemory), cores = Number(device.hardwareConcurrency);
    var lowMemory = memory > 0 && memory <= 4, lowCores = cores > 0 && cores <= 4;
    var tier = isMobile(options) || lowMemory || lowCores || device.connection && device.connection.saveData ? 'low' : 'balanced';
    var warmup = null, start = null, total = 0, count = 0, slow = 0;
    function reset() { warmup = start = null; total = count = slow = 0; }
    function profile() { return Object.assign({}, profiles[tier]); }
    function pixelRatio(width, height, dpr) {
      var p = profiles[tier], area = positive(width, 1) * positive(height, 1);
      return Math.min(positive(dpr, 1), p.maxDpr, Math.sqrt(p.maxPixels / area));
    }
    function sample(interval, now) {
      if (tier === 'economy' || !Number.isFinite(interval) || !Number.isFinite(now)) return false;
      // Visibility handlers explicitly reset the sampler. Clamp an isolated
      // upload's weight, but keep sustained very slow frames in the sample.
      if (interval <= 0) { reset(); return false; }
      interval = Math.min(interval, 250);
      if (warmup === null) warmup = now;
      if (now - warmup < 1000) return false;
      if (start === null) start = now;
      // A stable 30 fps device stays in the detailed low tier. Only sustained
      // pressure below about 23 fps earns the final, bounded 30 fps budget.
      var threshold = tier === 'low' ? 44 : 24;
      total += interval; count++; if (interval > threshold) slow++;
      if (now - start < 2000 || count < 20) return false;
      var downgrade = total / count > threshold && slow / count > .4;
      start = now; total = count = slow = 0;
      if (downgrade) { tier = tier === 'balanced' ? 'low' : 'economy'; reset(); return true; }
      return false;
    }
    return { profile: profile, pixelRatio: pixelRatio, sample: sample, reset: reset };
  }
  return { create: create, isMobile: isMobile };
});
