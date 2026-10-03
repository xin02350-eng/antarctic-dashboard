/* Fine-line navigation glyphs. Semantic labels and existing controls stay intact. */
(function (root) {
  'use strict';
  const glyphs = Object.freeze({ '↗': 'northeast', '→': 'right', '←': 'left', '↓': 'down', '↻': 'refresh' });
  const paths = Object.freeze({
    northeast: 'M5.5 18.5 18.5 5.5 M11.5 5.5H18.5V12.5',
    right: 'M3 12H21 M16.5 7.5 21 12 16.5 16.5',
    left: 'M21 12H3 M7.5 7.5 3 12 7.5 16.5',
    down: 'M12 3V21 M7.5 16.5 12 21 16.5 16.5',
    refresh: 'M19.5 8.5A8 8 0 1 0 20 15 M19.5 3.8V8.5H14.8'
  });
  const selectors = 'a,button,.table-scroll thead small';
  const pattern = /([↗→←↓↻])/u;

  function create(doc) {
    function icon(direction) {
      const ns = 'http://www.w3.org/2000/svg', svg = doc.createElementNS(ns, 'svg');
      svg.setAttribute('class', `icon icon-${direction}`);
      svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('width', '24'); svg.setAttribute('height', '24');
      svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false');
      svg.setAttribute('pointer-events', 'none'); svg.setAttribute('fill', 'none');
      svg.setAttribute('stroke', 'currentColor'); svg.setAttribute('stroke-width', '1.25');
      svg.setAttribute('stroke-linecap', 'round'); svg.setAttribute('stroke-linejoin', 'round');
      const path = doc.createElementNS(ns, 'path');
      path.setAttribute('d', paths[direction]); path.setAttribute('vector-effect', 'non-scaling-stroke');
      svg.appendChild(path); return svg;
    }

    function collect(node, pending) {
      if (node.nodeType === 3) {
        if (pattern.test(node.data)) pending.add(node);
        return;
      }
      // Previously mounted SVGs and any controls' input values are never rewritten.
      if (node.namespaceURI === 'http://www.w3.org/2000/svg' || /^(SCRIPT|STYLE|INPUT|SELECT|TEXTAREA)$/.test(node.nodeName || '')) return;
      Array.from(node.childNodes || []).forEach(child => collect(child, pending));
    }

    function mount(scope = doc) {
      const pending = new Set();
      Array.from(scope.querySelectorAll(selectors)).forEach(element => collect(element, pending));
      let replaced = 0;
      pending.forEach(node => {
        if (!node.parentNode) return;
        const fragment = doc.createDocumentFragment();
        node.data.split(pattern).forEach(part => {
          if (Object.hasOwn(glyphs, part)) { fragment.appendChild(icon(glyphs[part])); replaced++; }
          else if (part) fragment.appendChild(doc.createTextNode(part));
        });
        node.parentNode.replaceChild(fragment, node);
      });
      return replaced;
    }
    return { mount };
  }
  if (typeof module === 'object' && module.exports) module.exports = { glyphs, paths, selectors, create, mount: doc => create(doc).mount() };
  else root.ExpeditionIcons = create(root.document);
})(typeof window === 'object' ? window : globalThis);
