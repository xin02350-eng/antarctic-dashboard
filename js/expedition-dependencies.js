/* Optional libraries are fetched for visible work, never ahead of the mission. */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory;
  else root.ExpeditionDependencies = factory(root, root.document);
})(typeof window !== 'undefined' ? window : this, function (root, document) {
  'use strict';
  const assets = Object.create(null), groups = Object.create(null);
  let chartObserver = null, chartRevision = 0;
  const definitions = {
    charts: [{ key: 'chart', url: './assets/chart.umd.min.js', ready: () => typeof root.Chart === 'function' }],
    map: [
      { key: 'map-style', url: 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css', css: true, id: 'mapStyle' },
      { key: 'leaflet', url: 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js', ready: () => !!root.L?.map }
    ]
  };
  function asset(definition) {
    if (definition.ready?.()) return Promise.resolve();
    if (assets[definition.key]) return assets[definition.key];
    const promise = new Promise((resolve, reject) => {
      const node = document.createElement(definition.css ? 'link' : 'script');
      let settled = false, timer;
      function finish(error) {
        if (settled) return;
        settled = true; root.clearTimeout(timer); node.onload = node.onerror = null;
        if (error) { node.remove(); reject(error); } else resolve();
      }
      node.onload = () => finish(definition.ready && !definition.ready() ? new Error('Library unavailable') : null);
      node.onerror = () => finish(new Error('Library download failed'));
      if (definition.id) node.id = definition.id;
      if (definition.css) { node.rel = 'stylesheet'; node.href = definition.url; }
      else { node.async = true; node.src = definition.url; }
      // A stalled CDN must yield a recoverable state, not a permanently blank view.
      timer = root.setTimeout(() => finish(new Error('Library download timed out')), 12000);
      document.head.appendChild(node);
    });
    assets[definition.key] = promise;
    promise.catch(() => { if (assets[definition.key] === promise) delete assets[definition.key]; });
    return promise;
  }
  function state(name) { return groups[name]?.state || 'idle'; }
  function load(name, options = {}) {
    if (!definitions[name]) return Promise.reject(new Error('Unknown library'));
    const previous = groups[name];
    if (previous && (previous.state !== 'error' || !options.retry)) return previous.promise;
    const group = { state: 'loading' }; groups[name] = group;
    group.promise = Promise.all(definitions[name].map(asset)).then(() => {
      group.state = 'ready';
    }, error => { group.state = 'error'; throw error; });
    return group.promise;
  }
  function cancelCharts() {
    chartRevision++;
    if (chartObserver) chartObserver.disconnect();
    chartObserver = null;
  }
  function watchCharts(canvas, onState, options = {}) {
    cancelCharts();
    if (!canvas) return;
    const revision = chartRevision; let started = false;
    const current = () => revision === chartRevision && canvas.isConnected !== false && !document.hidden;
    const start = () => {
      if (!current() || started) return;
      started = true;
      if (chartObserver) chartObserver.disconnect();
      chartObserver = null;
      if (state('charts') === 'error' && !options.retry) { onState('error'); return; }
      onState('loading');
      load('charts', options).then(() => { if (current()) onState('ready'); }, () => { if (current()) onState('error'); });
    };
    const bounds = canvas.getBoundingClientRect();
    if (options.immediate || options.retry || typeof root.IntersectionObserver !== 'function' ||
        (bounds.bottom > 0 && bounds.top < root.innerHeight + 180)) { start(); return; }
    // The homepage's below-fold graph cannot compete with its 3D startup.
    chartObserver = new root.IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) start();
    }, { rootMargin: '180px', threshold: 0 });
    chartObserver.observe(canvas);
  }
  return { load, state, watchCharts, cancelCharts };
});
