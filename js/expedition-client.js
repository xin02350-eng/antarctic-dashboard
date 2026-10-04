/* Landscape client bootstrap. ES5 so an outdated WebView shows a useful message. */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory;
  else root.ExpeditionClient = factory(root, root.document);
})(typeof window === 'undefined' ? this : window, function (win, doc) {
  'use strict';
  var nativeClient = win.location.hostname === 'appassets.androidplatform.net';
  var explicit = /(?:^|[?&])client=mobile(?:&|$)/.test(win.location.search);
  var touch = win.matchMedia && win.matchMedia('(pointer: coarse)').matches;
  var mobile = nativeClient || explicit || !!(touch && Math.min(win.innerWidth, win.innerHeight) <= 768);
  var states = {}, revisions = {}, html = doc.documentElement;
  var api = { mobile: mobile, native: nativeClient, offline: function (id) { return states[id] === 'snapshot'; } };
  if (mobile) html.setAttribute('data-client', 'mobile');
  if (nativeClient) html.setAttribute('data-native-client', 'true');
  // A packaged snapshot is useful offline, but must never be labelled as a live fetch.
  api.readObservations = function (filename, signal) {
    if (!/^data(?:02|03)?\.json$/.test(filename)) return Promise.reject(new Error('Unknown observation source'));
    var id = filename === 'data02.json' ? 'a02' : filename === 'data03.json' ? 'a03' : 'a01';
    var abort, timer, aborted = false;
    var controller = typeof win.AbortController === 'function' ? new win.AbortController() : null;
    function read(url, readSignal) {
      return win.fetch(url, { cache: 'no-store', signal: readSignal }).then(function (response) {
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return response.json();
      }).then(function (data) {
        if (!Array.isArray(data)) throw new Error('Invalid observation data');
        return data;
      });
    }
    if (!nativeClient) return read('./' + filename, signal);
    if (signal && signal.aborted) return Promise.reject(new Error('Observation request cancelled'));
    var revision = revisions[id] = (revisions[id] || 0) + 1;
    var cancelled = new Promise(function (_, reject) {
      abort = function () { aborted = true; if (controller) controller.abort(); reject(new Error('Observation request cancelled')); };
      if (signal) signal.addEventListener('abort', abort, { once: true });
    });
    var timeout = new Promise(function (_, reject) {
      timer = win.setTimeout(function () { if (controller) controller.abort(); reject(new Error('Observation request timed out')); }, 8000);
    });
    var live = read('https://xin02350-eng.github.io/antarctic-dashboard/' + filename, controller ? controller.signal : signal);
    var result = Promise.race([live, timeout, cancelled]).then(function (data) {
      if (revisions[id] === revision) states[id] = 'live'; return data;
    }, function (error) {
      if (aborted || signal && signal.aborted) throw error;
      return read('./' + filename, signal).then(function (data) { if (revisions[id] === revision) states[id] = 'snapshot'; return data; });
    });
    function cleanup() { win.clearTimeout(timer); if (signal) signal.removeEventListener('abort', abort); }
    return result.then(function (data) { cleanup(); return data; }, function (error) { cleanup(); throw error; });
  };
  function compatible() {
    try { new Function('var value={}; return (value?.x ?? 0); async function probe() {}'); }
    catch (error) { return false; }
    return typeof win.Promise === 'function' && typeof win.fetch === 'function' &&
      typeof win.URLSearchParams === 'function' && typeof Array.prototype.flatMap === 'function' &&
      !!(win.Element && win.Element.prototype.replaceChildren);
  }
  function ready() {
    if (!compatible()) {
      html.setAttribute('data-client-incompatible', 'true');
      var compatibility = doc.getElementById('compatibilityNotice');
      if (compatibility) {
        compatibility.hidden = false;
        var reload = doc.getElementById('compatibilityReload');
        if (reload) reload.addEventListener('click', function () { win.location.reload(); });
      }
      return;
    }
    if (!mobile) return;
    var gate = doc.getElementById('orientationGate');
    if (!gate) return;
    var button = doc.getElementById('enterLandscape'), message = doc.getElementById('orientationMessage');
    var media = win.matchMedia('(orientation: portrait)');
    function translated() {
      var en = html.getAttribute('data-lang') === 'en';
      doc.getElementById('orientationTitle').textContent = en ? 'Turn to the horizon' : '横屏，进入极境';
      message.textContent = en ? 'Rotate your phone for the complete field view.' : '请将手机横放，展开完整任务现场。';
      button.textContent = en ? 'Enter landscape' : '进入横屏';
    }
    function sync() {
      var portrait = media.matches;
      html.setAttribute('data-client-portrait', portrait ? 'true' : 'false');
      gate.hidden = !portrait;
      ['appHeader', 'content', 'appFooter'].forEach(function (id) {
        var element = doc.getElementById(id); if (!element) return;
        if (portrait) { element.setAttribute('inert', ''); element.setAttribute('aria-hidden', 'true'); }
        else { element.removeAttribute('inert'); element.removeAttribute('aria-hidden'); }
      });
      // Off-screen GPU work pauses while the browser displays its rotation gate.
      win.dispatchEvent(new Event('dms:client-orientation'));
    }
    button.addEventListener('click', function () {
      var orientation = win.screen && win.screen.orientation;
      var request = html.requestFullscreen || html.webkitRequestFullscreen;
      Promise.resolve().then(function () {
        if (request && !doc.fullscreenElement) return request.call(html);
      }).then(function () {
        if (orientation && typeof orientation.lock === 'function') return orientation.lock('landscape');
        throw new Error('Manual rotation required');
      }).catch(function () {
        message.textContent = html.getAttribute('data-lang') === 'en' ? 'Enable system auto-rotate, then turn your phone sideways.' : '请开启系统自动旋转，再将手机横放。';
      });
    });
    if (media.addEventListener) media.addEventListener('change', sync);
    else if (media.addListener) media.addListener(sync);
    win.addEventListener('anx:langchange', translated);
    translated(); sync();
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', ready);
  else ready();
  return api;
});
