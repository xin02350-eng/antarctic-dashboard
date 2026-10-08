/* Compact 24-grid line icons. Semantic labels and existing controls stay intact. */
(function (root) {
  'use strict';
  const glyphs = Object.freeze({ '↗': 'northeast', '→': 'right', '←': 'left', '↓': 'down', '↻': 'refresh', '⇩': 'download' });
  const paths = Object.freeze({
    northeast: 'M7 17 17 7 M8 7H17V16',
    right: 'M5.5 12H18.5 M13.5 7 18.5 12 13.5 17',
    left: 'M18.5 12H5.5 M10.5 7 5.5 12 10.5 17',
    down: 'M12 5.5V18.5 M7 13.5 12 18.5 17 13.5',
    refresh: 'M19 9A7.3 7.3 0 1 0 19 15 M19 5V9H15',
    download: 'M12 4.5V15 M8 11 12 15 16 11 M5 16V19.5H19V16'
  });
  const selectors = 'a,button,.table-scroll thead small';
  const pattern = /([↗→←↓↻⇩])/u;

  function create(doc) {
    function icon(direction) {
      const ns = 'http://www.w3.org/2000/svg', svg = doc.createElementNS(ns, 'svg');
      svg.setAttribute('class', `icon icon-${direction}`);
      svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('width', '24'); svg.setAttribute('height', '24');
      svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false');
      svg.setAttribute('pointer-events', 'none'); svg.setAttribute('fill', 'none');
      svg.setAttribute('stroke', 'currentColor'); svg.setAttribute('stroke-width', '1.5');
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
          if (Object.prototype.hasOwnProperty.call(glyphs, part)) { fragment.appendChild(icon(glyphs[part])); replaced++; }
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
