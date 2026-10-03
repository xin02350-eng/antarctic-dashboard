/* One measured SVG edge per action. The browser animates its real stroke;
   JavaScript only measures on mount/resize and pauses hidden decorations. */
(function (root) {
  'use strict';
  const selectors = '.solid-link,.primary-link,.outline-button,.table-pager button,.telemetry-access button[type=submit]';
  const ns = 'http://www.w3.org/2000/svg';
  const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const rounded = value => Math.round(value * 1000) / 1000;

  function geometry(width, height, radius = 0) {
    const w = Math.max(2, finite(width, 2)), h = Math.max(2, finite(height, 2)), inset = .8;
    return { width: rounded(w), height: rounded(h), x: inset, y: inset,
      rectWidth: rounded(w - inset * 2), rectHeight: rounded(h - inset * 2),
      radius: rounded(Math.max(0, Math.min(finite(radius) - inset, (w - inset * 2) / 2, (h - inset * 2) / 2))) };
  }

  function create(doc, env = doc?.defaultView || root) {
    const entries = new Map();
    let resize, intersection, listening = false;

    function sync() {
      entries.forEach(entry => {
        const hidden = doc.hidden || !entry.visible || entry.source.hidden || entry.source.closest?.('[hidden]');
        entry.source.classList.toggle('action-trace-paused', !!hidden);
      });
    }

    function measure(entry) {
      const source = entry.source, computed = env.getComputedStyle?.(source);
      const bounds = source.getBoundingClientRect?.();
      const width = source.offsetWidth || bounds?.width || 2, height = source.offsetHeight || bounds?.height || 2;
      const radiusValue = computed?.borderTopLeftRadius || '0';
      const radius = radiusValue.includes('%') ? parseFloat(radiusValue) * Math.min(width, height) / 100 : parseFloat(radiusValue);
      const size = geometry(width, height, radius);
      entry.frame.setAttribute('viewBox', `0 0 ${size.width} ${size.height}`);
      // Absolute children use the padding box. Offset by the actual border so
      // SVG coordinates follow the full control outline without scaling it.
      entry.frame.style.width = `${size.width}px`; entry.frame.style.height = `${size.height}px`;
      entry.frame.style.left = `${-finite(parseFloat(computed?.borderLeftWidth))}px`;
      entry.frame.style.top = `${-finite(parseFloat(computed?.borderTopWidth))}px`;
      entry.rects.forEach(rect => {
        rect.setAttribute('x', size.x); rect.setAttribute('y', size.y);
        rect.setAttribute('width', size.rectWidth); rect.setAttribute('height', size.rectHeight);
        rect.setAttribute('rx', size.radius); rect.setAttribute('ry', size.radius);
      });
    }

    function begin() {
      if (listening) return;
      listening = true;
      doc.addEventListener('visibilitychange', sync);
      if (env.ResizeObserver) resize = new env.ResizeObserver(changes => {
        changes.forEach(change => { const entry = entries.get(change.target); if (entry) measure(entry); });
        sync();
      });
      else env.addEventListener?.('resize', remeasure);
      if (env.IntersectionObserver) intersection = new env.IntersectionObserver(changes => {
        changes.forEach(change => { const entry = entries.get(change.target); if (entry) entry.visible = change.isIntersecting; });
        sync();
      }, { threshold: 0 });
    }

    function remeasure() { entries.forEach(measure); sync(); }

    function release(entry) {
      resize?.unobserve?.(entry.source); intersection?.unobserve?.(entry.source);
      entry.frame.remove(); entry.source.classList.remove(...entry.addedClasses, 'action-trace-paused');
      entries.delete(entry.source);
    }

    function mount(scope = doc) {
      begin();
      entries.forEach(entry => { if (entry.source.isConnected === false) release(entry); });
      const candidates = new Set(scope.querySelectorAll(selectors));
      if (scope.matches?.(selectors)) candidates.add(scope);
      let mounted = 0;
      candidates.forEach(source => {
        if (entries.has(source)) { measure(entries.get(source)); return; }
        const frame = doc.createElementNS(ns, 'svg');
        frame.setAttribute('class', 'action-trace'); frame.setAttribute('aria-hidden', 'true');
        frame.setAttribute('focusable', 'false'); frame.setAttribute('pointer-events', 'none');
        frame.setAttribute('preserveAspectRatio', 'none');
        const rects = ['tail', 'core', 'head'].map(kind => {
          const rect = doc.createElementNS(ns, 'rect');
          rect.setAttribute('class', `action-trace-${kind}`); rect.setAttribute('pathLength', '100');
          rect.setAttribute('fill', 'none'); rect.setAttribute('vector-effect', 'non-scaling-stroke');
          frame.appendChild(rect); return rect;
        });
        const addedClasses = source.classList.contains('action-trace-host') ? [] : ['action-trace-host'];
        source.classList.add('action-trace-host'); source.appendChild(frame);
        const entry = { source, frame, rects, addedClasses, visible: true };
        entries.set(source, entry); measure(entry);
        resize?.observe(source); intersection?.observe(source); mounted++;
      });
      sync(); return mounted;
    }

    function destroy() {
      resize?.disconnect(); intersection?.disconnect(); resize = undefined; intersection = undefined;
      doc.removeEventListener('visibilitychange', sync); env.removeEventListener?.('resize', remeasure);
      Array.from(entries.values()).forEach(release); listening = false;
    }
    return { mount, destroy };
  }
  if (typeof module === 'object' && module.exports) module.exports = { selectors, geometry, create };
  else root.ExpeditionActions = create(root.document, root);
})(typeof window === 'object' ? window : globalThis);
