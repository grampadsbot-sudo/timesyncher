(() => {
  const sharedMatch = location.pathname.match(/^\/shared\/([^/]+)/);
  if (!sharedMatch) return;

  const token = decodeURIComponent(sharedMatch[1]);
  const AIRPLANE = /\u2708\uFE0F?|\u2708|✈️|^plane$/i;

  function text(value) {
    return String(value || '').trim();
  }

  function looksLikeFlight(place, override) {
    const source = `${place?.name || ''} ${override?.title || ''} ${place?.address || ''}`;
    if (/\b(las vegas|vegas)\b/i.test(source) && !/\b(flight|airport|sfo|jfk|lga|ewr|lax|depart|arrive)\b/i.test(source) && !/\b[A-Z]{3}\s+to\s+[A-Z]{3}\b/.test(source)) {
      return false;
    }
    return /\bflight\b|airport|jetblue|southwest|american airlines|\bdelta\b/i.test(source)
      || /\b(sfo|jfk|lga|ewr|lax|ord|dfw)\b/i.test(source)
      || /\b[A-Z]{3}\s+to\s+[A-Z]{3}\b/.test(source);
  }

  function categoryIcon(type) {
    if (type === 'flight') return '✈️';
    if (type === 'hotel') return '🧳';
    if (type === 'restaurant') return '🍽️';
    if (type === 'store' || type === 'shopping') return '🛍️';
    if (type === 'car') return '🚗';
    if (type === 'transport') return '🚕';
    if (type === 'bar') return '☕';
    if (type === 'attraction' || type === 'activity') return '🏛️';
    if (type === 'event') return '🎟️';
    return '📍';
  }

  function resolve(place, override) {
    const name = text(place?.category_name || override?.category || place?.category?.name).toLowerCase();
    const logoUrl = text(override?.logoUrl || place?.captured_logo_url || place?.logoUrl || '');
    if (looksLikeFlight(place, override) || name === 'flight') {
      return { type: 'flight', icon: '✈️', logoUrl, isFlight: true };
    }
    let type = 'other';
    if (name.includes('restaurant')) type = 'restaurant';
    else if (name.includes('store') || name.includes('shop')) type = 'store';
    else if (name.includes('hotel')) type = 'hotel';
    else if (name === 'car' || name.includes('rental')) type = 'car';
    else if (name.includes('attract') || name.includes('activit')) type = 'attraction';
    else if (name.includes('transport')) type = 'transport';
    else if (name.includes('bar') || name.includes('cocktail')) type = 'bar';
    const icon = categoryIcon(type);
    return { type, icon, logoUrl, isFlight: false };
  }

  function mark(el, resolved) {
    if (!el || el.dataset.tsIconFixed === '1') return;
    el.dataset.tsIconFixed = '1';
    el.dataset.tsIconType = resolved.type;
    if (resolved.logoUrl && !resolved.isFlight) {
      el.textContent = '';
      const img = document.createElement('img');
      img.src = resolved.logoUrl;
      img.alt = '';
      img.className = 'tiny-logo';
      img.style.width = '100%';
      img.style.height = '100%';
      img.style.objectFit = 'contain';
      el.appendChild(img);
      return;
    }
    const current = text(el.textContent);
    if (AIRPLANE.test(current) && !resolved.isFlight) {
      el.textContent = resolved.icon;
      return;
    }
    if (el.querySelector('svg') && !resolved.isFlight) {
      el.textContent = resolved.icon;
      return;
    }
    if (!current) el.textContent = resolved.icon;
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
        const value = text(node.textContent);
        return AIRPLANE.test(value) || (node.querySelector('svg') && node.childElementCount <= 2);
      }) || el.previousElementSibling;
      if (iconEl) mark(iconEl, resolved);
      seen.add(el);
    }
  }

  function hijackPdfLinks() {
    const style2 = `/shared/${encodeURIComponent(token)}/journey?style=2`;
    const originalOpen = window.open;
    window.open = function patchedOpen(url, ...rest) {
      const href = String(url || '');
      const isReport = /\/(?:api\/pdf\/)?shared\/[^/]+\/report\//i.test(href);
      const isDaily = /\/report\/daily(?:\/|\.pdf|$|\?)/i.test(href);
      if (isReport && !isDaily) {
        return originalOpen.call(this, style2, ...rest);
      }
      return originalOpen.call(this, url, ...rest);
    };
  }

  async function boot() {
    hijackPdfLinks();
    const response = await fetch(`/api/shared/${encodeURIComponent(token)}/`, { credentials: 'include' });
    if (!response.ok) return;
    const data = await response.json();
    const overrides = data.thingOverrides || {};
    const lookup = new Map();
    for (const place of data.places || []) {
      const override = overrides[`place:${place.id}`] || {};
      const resolved = resolve(place, override);
      lookup.set(place.name, resolved);
      if (override.title) lookup.set(override.title, resolved);
    }
    function repairStoryCards() {
      const titles = [...lookup.keys()].sort((a, b) => b.length - a.length);
      document.querySelectorAll('.story-card, article.thing').forEach((card) => {
        const title = text(card.querySelector('h3')?.textContent);
        const hit = titles.find((name) => title === name || title.startsWith(name));
        const found = hit ? lookup.get(hit) : null;
        if (!found || found.isFlight) return;
        card.querySelectorAll('.thing-emoji, .thing-logo, .tiny-logo').forEach((node) => {
          if (AIRPLANE.test(text(node.textContent))) mark(node, found);
          if (node.tagName === 'IMG') {
            node.addEventListener('error', () => mark(node, found), { once: true });
            const src = node.getAttribute('src') || '';
            if (/\.mp4(\?|#|$)|video\/|-video\./i.test(src)) mark(node, found);
          }
        });
      });
    }
    apply(lookup);
    repairStoryCards();
    new MutationObserver(() => {
      apply(lookup);
      repairStoryCards();
    }).observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => boot().catch(() => {}), { once: true });
  } else {
    boot().catch(() => {});
  }
})();
