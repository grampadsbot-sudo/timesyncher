(() => {
  const sharedMatch = location.pathname.match(/^\/shared\/([^/]+)/);
  if (!sharedMatch) return;

  const token = decodeURIComponent(sharedMatch[1]);
  const AIRPLANE = /\u2708\uFE0F?|\u2708|✈️/;

  async function fallbackResolve(place, override) {
    const name = String(place?.category_name || override?.category || '').toLowerCase();
    const title = `${place?.name || ''} ${place?.address || ''}`.toLowerCase();
    const isFlight = /\b(sfo|jfk|lga|ewr)\b/.test(title) || /\b[a-z]{3}\s+to\s+[a-z]{3}\b/.test(title);
    if (isFlight) return { type: 'flight', icon: '✈️', logoUrl: place?.image_url || '' };
    if (name.includes('restaurant')) return { type: 'restaurant', icon: '🍽️', logoUrl: place?.image_url || '' };
    if (name.includes('store') || name.includes('shop')) return { type: 'store', icon: '🛍️', logoUrl: place?.image_url || '' };
    if (name.includes('hotel')) return { type: 'hotel', icon: '🧳', logoUrl: place?.image_url || '' };
    if (name.includes('attraction') || name.includes('activity')) return { type: 'attraction', icon: '🏛️', logoUrl: place?.image_url || '' };
    if (name.includes('car')) return { type: 'car', icon: '🚗', logoUrl: place?.image_url || '' };
    return { type: 'other', icon: '📍', logoUrl: place?.image_url || '' };
  }

  function mark(el, icon, logoUrl) {
    if (!el || el.dataset.tsIconFixed === '1') return;
    el.dataset.tsIconFixed = '1';
    if (logoUrl) {
      el.textContent = '';
      const img = document.createElement('img');
      img.src = logoUrl;
      img.alt = '';
      img.style.width = '100%';
      img.style.height = '100%';
      img.style.objectFit = 'contain';
      el.appendChild(img);
      return;
    }
    if (AIRPLANE.test(el.textContent || '') || el.querySelector('svg')) {
      el.textContent = icon;
    } else if (!(el.textContent || '').trim()) {
      el.textContent = icon;
    }
  }

  function apply(lookup) {
    const titles = [...lookup.keys()].sort((a, b) => b.length - a.length);
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
    const seen = new Set();
    while (walker.nextNode()) {
      const el = walker.currentNode;
      const label = (el.textContent || '').replace(/\s+/g, ' ').trim();
      if (!label || label.length > 160) continue;
      const hit = titles.find((title) => label === title || label.startsWith(title));
      if (!hit || seen.has(el)) continue;
      const resolved = lookup.get(hit);
      if (!resolved) continue;
      const row = el.closest('[class]') || el.parentElement;
      if (!row) continue;
      const iconEl = [...row.querySelectorAll('span, div, i')].find((node) => {
        const text = (node.textContent || '').trim();
        return text === '✈️' || AIRPLANE.test(text) || (node.querySelector('svg') && node.childElementCount <= 2);
      }) || el.previousElementSibling;
      if (iconEl && !resolved.isFlight) mark(iconEl, resolved.icon, resolved.logoUrl);
      if (iconEl && resolved.isFlight) iconEl.dataset.tsIconFixed = '1';
      seen.add(el);
    }
  }

  async function boot() {
    const response = await fetch(`/api/shared/${encodeURIComponent(token)}/`, { credentials: 'include' });
    if (!response.ok) return;
    const data = await response.json();
    const overrides = data.thingOverrides || {};
    const lookup = new Map();
    for (const place of data.places || []) {
      const override = overrides[`place:${place.id}`] || {};
      const resolved = await fallbackResolve(place, override);
      lookup.set(place.name, resolved);
      if (override.title) lookup.set(override.title, resolved);
    }
    apply(lookup);
    new MutationObserver(() => apply(lookup)).observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => boot().catch(() => {}), { once: true });
  } else {
    boot().catch(() => {});
  }
})();
