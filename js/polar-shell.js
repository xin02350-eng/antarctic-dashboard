/* Shared presentation shell. Original records, charts, access gate and map handlers stay intact. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else api.start(root.document, root);
})(typeof window === 'undefined' ? globalThis : window, function () {
  'use strict';
  function isMobileClient(win) {
    if (new URLSearchParams(win.location.search || '').get('client') === 'mobile') return true;
    return !!(win.matchMedia && win.matchMedia('(pointer: coarse)').matches && Math.min(win.innerWidth, win.innerHeight) <= 768);
  }
  function desktopRoute(file, query, mobile) {
    var params = new URLSearchParams(query || '');
    if (params.get('legacy') === '1') return null;
    var view = (file || 'index.html').replace(/\.html$/, '').replace(/-a0[23]$/, '');
    if (view === 'a02') view = 'dashboard';
    if (view === 'index') view = params.get('view') === 'globe' ? 'globe' : 'dashboard';
    if (!/^(dashboard|location|network|sensors|telemetry|hardware|analysis|download|globe)$/.test(view)) return null;
    // A node-specific filename remains authoritative; generic bookmarks may
    // carry a validated station query without losing it at the shared entry.
    var node = /(?:-a02|^a02)\.html$/.test(file) ? 'a02' : /-a03\.html$/.test(file) ? 'a03' :
      /^a0[123]$/.test(params.get('station')) ? params.get('station') : 'a01';
    return './expedition.html?view=' + view + '&station=' + node + (mobile || params.get('client') === 'mobile' ? '&client=mobile' : '');
  }
  function route(filename, station) {
    var family = filename.replace(/\.html$/, '').replace(/-a0[23]$/, '');
    if (family === 'a02') family = 'dashboard';
    if (!/^(dashboard|location|sensors|telemetry|hardware|analysis)$/.test(family)) family = 'dashboard';
    return './' + family + (station === 'a01' ? '' : '-' + station) + '.html';
  }
  function mount(doc, win) {
    if (doc.querySelector('.polar-shell')) return;
    var file = win.location.pathname.split('/').pop() || 'index.html';
    if (file === 'observatory.html' || file === 'test.html') return;
    var desktop = win.matchMedia('(min-width: 769px)');
    // Only legacy/diagnostic desktop surfaces need the presentation shell.
    if (!desktop.matches) return;
    var station = /(?:-a02|^a02)\.html$/.test(file) ? 'a02' : /-a03\.html$/.test(file) ? 'a03' : 'a01';
    var sidebar = doc.querySelector('.sidebar'), main = doc.querySelector('.app > main');
    doc.documentElement.classList.add('polar-workspace');
    doc.body.classList.add('polar-site');
    if (sidebar) doc.body.classList.add('polar-console');
    if (file === 'download.html') doc.body.classList.add('polar-download');
    var bar = doc.createElement('header'); bar.className = 'polar-shell';
    bar.innerHTML = '<a class="polar-brand" href="./observatory.html"><b>D·M·S</b><span>POLAR OBSERVATORY</span></a>' +
      '<nav class="polar-global" aria-label="全站导航"><a href="./observatory.html" data-polar-zh="极境现场" data-polar-en="FIELD VIEW"></a>' +
      '<a href="./network.html" data-polar-zh="观测网络" data-polar-en="NETWORK"></a>' +
      '<a href="./index.html?view=globe" data-polar-zh="全球视野" data-polar-en="GLOBE"></a>' +
      '<a href="./download.html" data-polar-zh="客户端下载" data-polar-en="DOWNLOAD"></a></nav><div class="polar-tools"></div>';
    doc.body.insertBefore(bar, doc.body.firstChild);
    var originalLanguage = doc.querySelector('.lang-switch');
    var languageHome;
    if (originalLanguage) {
      languageHome = doc.createComment('Original language switch position');
      originalLanguage.parentNode.insertBefore(languageHome, originalLanguage);
      bar.querySelector('.polar-tools').appendChild(originalLanguage);
    }
    if (sidebar) {
      var brand = sidebar.querySelector('.brand');
      var stationBlock = doc.createElement('div'); stationBlock.className = 'polar-station-block';
      stationBlock.innerHTML = '<span class="polar-eyebrow">OBSERVATION NODE</span><strong>DMS–' + station.toUpperCase() + '</strong><nav class="polar-station-nav" aria-label="切换观测节点">' +
        ['a01', 'a02', 'a03'].map(function (id) { return '<a href="' + route(file, id) + '"' + (id === station ? ' aria-current="true"' : '') + '>' + id.toUpperCase() + '</a>'; }).join('') + '</nav>';
      sidebar.insertBefore(stationBlock, brand);
      sidebar.querySelectorAll('.sidebar-menu .nav-item').forEach(function (link, index) {
        link.setAttribute('data-step', ('0' + (index + 1)).slice(-2));
        if (link.classList.contains('active')) link.setAttribute('aria-current', 'page');
      });
      var foot = doc.createElement('a'); foot.className = 'polar-return'; foot.href = './observatory.html?station=' + station;
      foot.innerHTML = '<span data-polar-zh="返回极境现场" data-polar-en="BACK TO THE FIELD"></span><span aria-hidden="true">↗</span>';
      sidebar.appendChild(foot);
      if (main) {
        var eyebrow = doc.createElement('div'); eyebrow.className = 'polar-breadcrumb';
        eyebrow.innerHTML = '<span>ANTARCTIC FIELD SYSTEM</span><i>/</i><span>' + station.toUpperCase() + '</span><i>/</i><span data-polar-zh="观测工作台" data-polar-en="OPERATIONS WORKSPACE"></span>';
        main.insertBefore(eyebrow, main.firstChild);
      }
    }
    var activeGlobal = file === 'network.html' ? 'network.html' : file === 'download.html' ? 'download.html' : file === 'index.html' ? 'index.html?view=globe' : '';
    if (activeGlobal) bar.querySelector('a[href="./' + activeGlobal + '"]').setAttribute('aria-current', 'page');
    function translate() {
      var zh = doc.documentElement.getAttribute('data-lang') === 'zh' || !originalLanguage;
      doc.querySelectorAll('[data-polar-zh]').forEach(function (el) { el.textContent = el.getAttribute(zh ? 'data-polar-zh' : 'data-polar-en'); });
    }
    translate(); win.addEventListener('anx:langchange', translate);
    // Moving the original switch preserves its listeners. Do not create a second language state.
    var langObserver = new win.MutationObserver(translate); langObserver.observe(doc.documentElement, { attributes: true, attributeFilter: ['data-lang'] });
    win.dispatchEvent(new win.Event('resize'));
    return function unmount() {
      langObserver.disconnect();
      win.removeEventListener('anx:langchange', translate);
      if (languageHome && languageHome.parentNode) {
        languageHome.parentNode.replaceChild(originalLanguage, languageHome);
      }
      [bar, stationBlock, foot, eyebrow].forEach(function (el) { if (el) el.remove(); });
      doc.documentElement.classList.remove('polar-workspace');
      doc.body.classList.remove('polar-site', 'polar-console', 'polar-download');
      win.dispatchEvent(new win.Event('resize'));
    };
  }
  function start(doc, win) {
    var desktop = win.matchMedia('(min-width: 769px)'), dispose;
    function adapt() {
      var mobile = isMobileClient(win);
      var destination = desktopRoute(win.location.pathname.split('/').pop(), win.location.search, mobile);
      if ((desktop.matches || mobile) && destination && typeof win.location.replace === 'function') { win.location.replace(destination); return; }
      if (desktop.matches && !dispose) dispose = mount(doc, win);
      else if (!desktop.matches && dispose) { dispose(); dispose = null; }
    }
    adapt();
    if (desktop.addEventListener) desktop.addEventListener('change', adapt);
    else if (desktop.addListener) desktop.addListener(adapt);
    return function stop() {
      if (desktop.removeEventListener) desktop.removeEventListener('change', adapt);
      else if (desktop.removeListener) desktop.removeListener(adapt);
      if (dispose) dispose();
    };
  }
  return { route: route, desktopRoute: desktopRoute, isMobileClient: isMobileClient, mount: mount, start: start };
});
