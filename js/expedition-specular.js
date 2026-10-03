/* Pointer-lit, machined edges. No perimeter orbit or permanently running frame. */
(function (root) {
  'use strict';
  const selectors = '.mini-signal,.node-entry';
  const limit = 24, ns = 'http://www.w3.org/2000/svg';
  const properties = ['--surface-x', '--surface-y', '--surface-rx', '--surface-ry', '--surface-lift', '--surface-light'];
  const finite = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const coordinate = value => Math.round(value * 1000) / 1000;
  const clamp = value => Math.max(0, Math.min(1, finite(value, .5)));
  const neutral = () => ({ x: .5, y: 0, rx: 0, ry: 0, lift: 0, light: 0 });
  let serial = 0;

  function outline(width, height, radius = 10) {
    const w = Math.max(4, finite(width, 4)), h = Math.max(4, finite(height, 4));
    const i = 1.2, r = Math.max(0, Math.min(finite(radius, 10) - i, (w - 2 * i) / 2, (h - 2 * i) / 2));
    const left = i, top = i, right = w - i, bottom = h - i, p = coordinate;
    const arc = `A ${p(r)} ${p(r)} 0 0 1`;
    return `M ${p(left + r)} ${p(top)} H ${p(right - r)} ${arc} ${p(right)} ${p(top + r)} V ${p(bottom - r)} ${arc} ${p(right - r)} ${p(bottom)} H ${p(left + r)} ${arc} ${p(left)} ${p(bottom - r)} V ${p(top + r)} ${arc} ${p(left + r)} ${p(top)} Z`;
  }

  function create(doc, env) {
    let entries = [], resize, intersection, motion, coarse, raf = 0, lastTime;
    const settling = new Set();
    const blocked = entry => !!doc.hidden || !entry.visible || !!motion?.matches || !!coarse?.matches;
    const invalidateBounds = () => entries.forEach(entry => { entry.bounds = undefined; });

    function paint(entry) {
      const value = entry.current, style = entry.anchor.style;
      style.setProperty('--surface-x', `${coordinate(value.x * 100)}%`);
      style.setProperty('--surface-y', `${coordinate(value.y * 100)}%`);
      style.setProperty('--surface-rx', `${coordinate(value.rx)}deg`);
      style.setProperty('--surface-ry', `${coordinate(value.ry)}deg`);
      style.setProperty('--surface-lift', `${coordinate(value.lift)}px`);
      style.setProperty('--surface-light', `${coordinate(value.light)}`);
      const x = value.x * entry.width, y = value.y * entry.height;
      // A slender oblique band acts like light reflecting from a polished bevel.
      // Its transparent stops leave the remainder of the perimeter invisible.
      const span = Math.max(110, Math.min(250, Math.hypot(entry.width, entry.height) * .24));
      entry.gradient.setAttribute('x1', coordinate(x - span * .83));
      entry.gradient.setAttribute('y1', coordinate(y - span * .56));
      entry.gradient.setAttribute('x2', coordinate(x + span * .83));
      entry.gradient.setAttribute('y2', coordinate(y + span * .56));
      const strength = .035 + value.light * .765;
      entry.stops.forEach((stop, index) => stop.setAttribute('stop-opacity', coordinate(strength * [0, 0, .3, 1, .28, 0, 0][index])));
    }

    function stopIfIdle() {
      if (!settling.size && raf) { env.cancelAnimationFrame?.(raf); raf = 0; lastTime = undefined; }
    }

    function reset(entry) {
      entry.hover = false; entry.anchor.classList.remove('surface-hover');
      entry.current = neutral(); entry.target = neutral(); entry.bounds = undefined;
      settling.delete(entry); paint(entry); stopIfIdle();
    }

    function frame(time) {
      raf = 0;
      const dt = lastTime === undefined ? 16 : Math.max(8, Math.min(40, time - lastTime));
      lastTime = time;
      const alpha = 1 - Math.exp(-dt / 78);
      Array.from(settling).forEach(entry => {
        if (blocked(entry)) { reset(entry); return; }
        let remaining = false;
        for (const key of Object.keys(entry.current)) {
          const distance = entry.target[key] - entry.current[key];
          entry.current[key] += distance * alpha;
          if (Math.abs(distance) > (key === 'lift' ? .02 : .002)) remaining = true;
        }
        entry.steps++;
        if (!remaining || entry.steps >= 90) { entry.current = { ...entry.target }; settling.delete(entry); }
        paint(entry);
      });
      if (settling.size) raf = env.requestAnimationFrame(frame);
      else lastTime = undefined;
    }

    function settle(entry) {
      if (blocked(entry)) { reset(entry); return; }
      if (!env.requestAnimationFrame) { entry.current = { ...entry.target }; paint(entry); return; }
      entry.steps = 0; settling.add(entry);
      if (!raf) raf = env.requestAnimationFrame(frame);
    }

    function bounds(entry) {
      const rect = entry.source.getBoundingClientRect();
      // Freeze untransformed dimensions once on entry: a tilted bounding box
      // measured on every move would create feedback and unstable edge hover.
      return {
        left: finite(rect.left, 0) + (finite(rect.width, entry.width) - entry.width) / 2,
        top: finite(rect.top, 0) + (finite(rect.height, entry.height) - entry.height) / 2 + entry.current.lift,
        width: entry.width, height: entry.height
      };
    }

    function pointer(entry, event) {
      if (blocked(entry) || event.pointerType === 'touch' || finite(event.buttons, 0) > 0) { reset(entry); return; }
      if (!entry.hover || !entry.bounds) entry.bounds = bounds(entry);
      if (!entry.hover) { entry.hover = true; entry.anchor.classList.add('surface-hover'); }
      const area = entry.bounds, x = clamp((finite(event.clientX, area.left + area.width / 2) - area.left) / area.width);
      const y = clamp((finite(event.clientY, area.top + area.height / 2) - area.top) / area.height);
      // Damp the outer edge so moving the card cannot move its hit region away
      // from a stationary pointer and trigger alternating enter/leave events.
      const edge = Math.min(x * entry.width, (1 - x) * entry.width, y * entry.height, (1 - y) * entry.height);
      const gain = clamp(edge / 24), damping = gain * gain * (3 - 2 * gain);
      entry.target = { x, y, rx: (0.5 - y) * 2 * entry.tilt * damping, ry: (x - .5) * 2 * entry.tilt * damping, lift: entry.lift * damping, light: 1 };
      settle(entry);
    }

    const sync = () => entries.forEach(entry => {
      entry.anchor.classList.toggle('specular-paused', blocked(entry));
      entry.anchor.classList.toggle('specular-reduced', !!motion?.matches || !!coarse?.matches);
      if (blocked(entry)) reset(entry);
    });

    function destroy() {
      if (raf) env.cancelAnimationFrame?.(raf);
      raf = 0; lastTime = undefined; settling.clear();
      resize?.disconnect(); intersection?.disconnect();
      doc.removeEventListener('visibilitychange', sync);
      doc.removeEventListener('scroll', invalidateBounds, true);
      [motion, coarse].forEach(query => {
        if (query?.removeEventListener) query.removeEventListener('change', sync);
        else query?.removeListener?.(sync);
      });
      entries.forEach(entry => {
        for (const [name, handler] of Object.entries(entry.handlers)) entry.source.removeEventListener(name, handler);
        entry.frame.remove(); entry.anchor.classList.remove(...entry.addedClasses, 'surface-hover', 'specular-paused', 'specular-reduced');
        entry.originalStyles.forEach((original, index) => {
          if (original.value) entry.anchor.style.setProperty(properties[index], original.value, original.priority);
          else entry.anchor.style.removeProperty(properties[index]);
        });
      });
      entries = []; resize = undefined; intersection = undefined; motion = undefined; coarse = undefined;
    }

    function mount() {
      destroy();
      motion = env.matchMedia?.('(prefers-reduced-motion: reduce)');
      coarse = env.matchMedia?.('(pointer: coarse)');
      const anchors = new Set();
      const candidates = Array.from(doc.querySelectorAll(selectors)).filter(source => {
        if (source.hidden || source.closest?.('[hidden]')) return false;
        return finite(source.offsetWidth || source.clientWidth, 0) >= 24 && finite(source.offsetHeight || source.clientHeight, 0) >= 24;
      }).slice(0, limit);
      candidates.forEach(source => {
        const ledger = source.classList.contains('table-scroll');
        const optical = ['atlas', 'instrument-stage', 'globe-stage'].some(name => source.classList.contains(name));
        const small = ['mini-signal', 'node-entry'].some(name => source.classList.contains(name));
        const anchor = ledger ? source.parentElement : source;
        if (!anchor || anchors.has(anchor)) return;
        anchors.add(anchor);
        const frame = doc.createElementNS(ns, 'svg');
        frame.setAttribute('class', 'specular-frame'); frame.setAttribute('aria-hidden', 'true'); frame.setAttribute('focusable', 'false');
        frame.setAttribute('pointer-events', 'none'); frame.setAttribute('preserveAspectRatio', 'none');
        const defs = doc.createElementNS(ns, 'defs'), gradient = doc.createElementNS(ns, 'linearGradient'), id = `surface-reflection-${++serial}`;
        gradient.setAttribute('id', id); gradient.setAttribute('gradientUnits', 'userSpaceOnUse');
        const stops = [0, .29, .465, .5, .535, .71, 1].map((offset, index) => {
          const stop = doc.createElementNS(ns, 'stop');
          stop.setAttribute('offset', offset); stop.setAttribute('stop-color', index === 3 ? '#f5fbff' : '#b7c9d5');
          gradient.appendChild(stop); return stop;
        });
        defs.appendChild(gradient); frame.appendChild(defs);
        const paths = ['diffuse', 'tail', 'edge', 'core'].map(kind => {
          const path = doc.createElementNS(ns, 'path');
          path.setAttribute('class', `specular-${kind}`); path.setAttribute('fill', 'none');
          path.setAttribute('stroke', `url(#${id})`); path.setAttribute('stroke-dasharray', 'none');
          path.setAttribute('vector-effect', 'non-scaling-stroke'); frame.appendChild(path); return path;
        });
        const classes = ['specular-host', ledger ? 'surface-ledger' : optical ? 'surface-optical' : 'surface-float'];
        const addedClasses = classes.filter(name => !anchor.classList.contains(name));
        const originalStyles = properties.map(name => ({ value: anchor.style.getPropertyValue(name), priority: anchor.style.getPropertyPriority?.(name) || '' }));
        anchor.classList.add(...classes); anchor.appendChild(frame);
        const entry = { source, anchor, frame, gradient, stops, paths, visible: true, hover: false, tilt: 0, lift: small ? 2 : 0, addedClasses, originalStyles, current: neutral(), target: neutral(), steps: 0 };
        entry.measure = () => {
          entry.width = Math.max(4, finite(source.offsetWidth || source.clientWidth, 4));
          entry.height = Math.max(4, finite(source.offsetHeight || source.clientHeight, 4));
          frame.setAttribute('viewBox', `0 0 ${entry.width} ${entry.height}`);
          if (ledger) {
            const sourceRect = source.getBoundingClientRect(), anchorRect = anchor.getBoundingClientRect();
            frame.style.setProperty('left', `${coordinate(sourceRect.left - anchorRect.left + (anchor.scrollLeft || 0) - (anchor.clientLeft || 0))}px`);
            frame.style.setProperty('top', `${coordinate(sourceRect.top - anchorRect.top + (anchor.scrollTop || 0) - (anchor.clientTop || 0))}px`);
            frame.style.setProperty('width', `${entry.width}px`); frame.style.setProperty('height', `${entry.height}px`);
          }
          const computed = env.getComputedStyle?.(source), radius = finite(parseFloat(computed?.borderTopLeftRadius), 10);
          const d = outline(entry.width, entry.height, radius);
          paths.forEach(path => path.setAttribute('d', d));
          if (entry.hover) entry.bounds = bounds(entry);
          paint(entry);
        };
        entry.handlers = {
          pointerenter: event => pointer(entry, event),
          pointermove: event => pointer(entry, event),
          pointerleave: () => {
            entry.hover = false; entry.bounds = undefined; anchor.classList.remove('surface-hover');
            entry.target = neutral(); settle(entry);
          }
        };
        Object.entries(entry.handlers).forEach(([name, handler]) => source.addEventListener(name, handler, { passive: true }));
        entry.measure(); entries.push(entry);
      });
      if (env.ResizeObserver) {
        resize = new env.ResizeObserver(changes => changes.forEach(change => {
          entries.filter(entry => entry.source === change.target || entry.anchor === change.target).forEach(entry => entry.measure());
        }));
        entries.forEach(entry => { resize.observe(entry.source); if (entry.source !== entry.anchor) resize.observe(entry.anchor); });
      }
      if (env.IntersectionObserver) {
        intersection = new env.IntersectionObserver(changes => {
          changes.forEach(change => {
            const entry = entries.find(item => item.source === change.target);
            if (entry) entry.visible = change.isIntersecting;
          }); sync();
        }, { threshold: 0 });
        entries.forEach(entry => intersection.observe(entry.source));
      }
      [motion, coarse].forEach(query => {
        if (query?.addEventListener) query.addEventListener('change', sync);
        else query?.addListener?.(sync);
      });
      doc.addEventListener('visibilitychange', sync);
      doc.addEventListener('scroll', invalidateBounds, { passive: true, capture: true });
      sync();
    }
    return { mount, destroy };
  }
  if (typeof module === 'object' && module.exports) module.exports = { outline, create, selectors, limit };
  else root.ExpeditionSpecular = create(root.document, root);
})(typeof window === 'object' ? window : globalThis);
