/* The original site's masked gradient arc, with a measured SVG stroke fallback.
   JavaScript only detects paint support, measures on mount/resize, repairs
   replaced labels, and pauses hidden decorations. CSS owns all motion. */
(function (root) {
  'use strict';
  const cardSelectors = '.mini-signal[aria-pressed=true],.node-entry.selected';
  const selectors = `.solid-link,.primary-link,.outline-button,.table-pager button,.telemetry-access button[type=submit],${cardSelectors}`;
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
    let supportsFlow = typeof env.CSS?.registerProperty === 'function' &&
      !!env.CSS?.supports?.('background', 'conic-gradient(from 0deg,transparent,#fff)') &&
      (!!env.CSS?.supports?.('mask-composite', 'exclude') || !!env.CSS?.supports?.('-webkit-mask-composite', 'xor'));
    if (supportsFlow) {
      try {
        // Some engines expose the registration API before parsing @property.
        // Register explicitly so the angle interpolates instead of jumping.
        env.CSS.registerProperty({ name: '--action-flow-angle', syntax: '<angle>', inherits: false, initialValue: '0deg' });
      } catch (error) {
        // A prior create() or stylesheet registration may already own the name.
        // Other registration failures cannot promise interpolation: use SVG.
        supportsFlow = error?.name === 'InvalidModificationError';
      }
    }
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

    function repair(entry) {
      if (entry.frame.parentNode !== entry.source) entry.source.appendChild(entry.frame);
      measure(entry);
    }

    function release(entry) {
      entry.mutation?.disconnect();
      resize?.unobserve?.(entry.source); intersection?.unobserve?.(entry.source);
      entry.frame.remove(); entry.source.classList.remove(...entry.addedClasses, 'action-trace-paused');
      entries.delete(entry.source);
    }

    function mount(scope = doc) {
      begin();
      entries.forEach(entry => {
        if (entry.source.isConnected === false || (entry.card && entry.source.matches?.(cardSelectors) === false)) release(entry);
      });
      const candidates = new Set(scope.querySelectorAll(selectors));
      if (scope.matches?.(selectors)) candidates.add(scope);
      let mounted = 0;
      candidates.forEach(source => {
        if (entries.has(source)) { repair(entries.get(source)); return; }
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
        const card = !!source.matches?.(cardSelectors);
        const desiredClasses = supportsFlow ? ['action-trace-host', 'action-flow-host'] : ['action-trace-host'];
        if (card) desiredClasses.push('action-trace-card');
        const addedClasses = desiredClasses.filter(name => !source.classList.contains(name));
        source.classList.add(...desiredClasses); source.appendChild(frame);
        const entry = { source, frame, rects, addedClasses, visible: true, card };
        entries.set(source, entry); measure(entry);
        // Telemetry translation replaces button.textContent even when the label
        // and its dimensions are unchanged (for example after a wrong password).
        // Observe only this control's direct children, never the page subtree.
        if (env.MutationObserver) {
          entry.mutation = new env.MutationObserver(() => {
            if (entries.get(source) !== entry || source.isConnected === false || frame.parentNode === source) return;
            repair(entry);
          });
          entry.mutation.observe(source, { childList: true });
        }
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
