/* Patch a local view in place: unchanged scene frames must never be detached. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ExpeditionView = api;
})(typeof window === 'undefined' ? null : window, function () {
  'use strict';

  function structuralKey(node) {
    const id = node.getAttribute('id');
    if (id) return 'id:' + id;
    const key = node.getAttribute('data-view-key');
    if (key) return 'key:' + key;
    // The leading class belongs to the renderer; finish hooks append classes.
    return 'class:' + (node.getAttribute('class') || '').trim().split(/\s+/)[0];
  }

  function compatible(current, incoming) {
    if (!current || current.nodeType !== incoming.nodeType) return false;
    if (current.nodeType !== 1) return true;
    if (current.tagName !== incoming.tagName || current.namespaceURI !== incoming.namespaceURI) return false;
    if (structuralKey(current) !== structuralKey(incoming)) return false;
    // Changing station, language, profile or route is a new scene, not a refresh.
    return current.tagName !== 'IFRAME' || current.getAttribute('src') === incoming.getAttribute('src');
  }

  function firstFrame(node) {
    if (node.nodeType === 1 && node.tagName === 'IFRAME') return node;
    for (const child of Array.from(node.childNodes)) {
      const frame = firstFrame(child);
      if (frame) return frame;
    }
    return null;
  }

  function keepReadyState(current, incoming) {
    if (!current.classList.contains('mission-stage') || !current.classList.contains('is-ready')) return false;
    const oldFrame = firstFrame(current), nextFrame = firstFrame(incoming);
    return !!oldFrame && !!nextFrame && compatible(oldFrame, nextFrame);
  }

  function attributes(current, incoming) {
    const ready = keepReadyState(current, incoming);
    const frame = current.tagName === 'IFRAME';
    for (const attr of Array.from(current.attributes)) {
      if (!incoming.hasAttribute(attr.name)) current.removeAttribute(attr.name);
    }
    for (const attr of Array.from(incoming.attributes)) {
      // Even assigning the same src can restart a browsing context.
      if (frame && attr.name === 'src') continue;
      let value = attr.value;
      if (ready && attr.name === 'class' && !value.split(/\s+/).includes('is-ready')) value += ' is-ready';
      if (current.getAttribute(attr.name) !== value) current.setAttribute(attr.name, value);
    }
  }

  function patchNode(current, incoming) {
    if (current.nodeType === 1) {
      attributes(current, incoming);
      patchChildren(current, incoming);
    } else if (current.nodeValue !== incoming.nodeValue) {
      current.nodeValue = incoming.nodeValue;
    }
  }

  function patchChildren(parent, source) {
    const incoming = Array.from(source.childNodes);
    let current = parent.firstChild;
    for (let index = 0; index < incoming.length; index++) {
      const next = incoming[index];
      if (!current) {
        parent.appendChild(next.cloneNode(true));
        continue;
      }
      if (!compatible(current, next)) {
        const remaining = incoming.slice(index + 1);
        // Inserting an error banner before a scene must not replace the scene.
        if (remaining.some(node => compatible(current, node))) {
          parent.insertBefore(next.cloneNode(true), current);
          continue;
        }
        // Removing an obsolete prefix leaves the following scene where it is.
        let candidate = current.nextSibling;
        while (candidate && !compatible(candidate, next)) {
          if (remaining.some(node => compatible(candidate, node))) break;
          candidate = candidate.nextSibling;
        }
        if (candidate && compatible(candidate, next)) {
          while (current !== candidate) {
            const following = current.nextSibling;
            parent.removeChild(current);
            current = following;
          }
        } else {
          const replacement = next.cloneNode(true);
          parent.replaceChild(replacement, current);
          current = replacement.nextSibling;
          continue;
        }
      }
      patchNode(current, next);
      current = current.nextSibling;
    }
    while (current) {
      const following = current.nextSibling;
      parent.removeChild(current);
      current = following;
    }
  }

  function render(container, html) {
    if (!container || !container.ownerDocument) throw new TypeError('A view container is required');
    const template = container.ownerDocument.createElement('template');
    template.innerHTML = html;
    patchChildren(container, template.content);
    return container;
  }

  const routes = new WeakMap();
  function routeState(node, active) {
    if (node.nodeType === 1) {
      const id = node.getAttribute(active ? 'data-suspended-id' : 'id');
      if (id) { node.setAttribute(active ? 'id' : 'data-suspended-id', id); node.removeAttribute(active ? 'data-suspended-id' : 'id'); }
    }
    for (const child of Array.from(node.childNodes)) routeState(child, active);
  }
  function route(container, key) {
    if (!container || !container.ownerDocument) throw new TypeError('A route container is required');
    let pages = routes.get(container);
    if (!pages) { pages = new Map(); routes.set(container, pages); }
    // Only the four 3D routes persist. All ordinary pages reuse one bounded slot.
    const slot = ['dashboard', 'hardware', 'network', 'globe'].includes(key) ? key : 'ui';
    let page = pages.get(slot);
    if (!page) {
      page = container.ownerDocument.createElement('div');
      page.setAttribute('class', 'route-page'); page.setAttribute('data-route-page', slot);
      pages.set(slot, page); container.appendChild(page);
    }
    for (const current of pages.values()) {
      const active = current === page;
      routeState(current, active);
      if (active) { current.removeAttribute('hidden'); current.removeAttribute('inert'); current.removeAttribute('aria-hidden'); }
      else { current.setAttribute('hidden', ''); current.setAttribute('inert', ''); current.setAttribute('aria-hidden', 'true'); }
    }
    return page;
  }
  return Object.freeze({ render, route });
});
