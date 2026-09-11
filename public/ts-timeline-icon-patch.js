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

  function isPrintReport() {
    return new URLSearchParams(location.search).get('printMode') === 'report';
  }

  function storiesPrintCss() {
    return [
      '.keepsake-list-page[data-stories-bottom-margin="1"],.keepsake-list-page[data-stories-up-front="1"]{padding-bottom:36mm!important;overflow:visible!important;-webkit-box-decoration-break:clone;box-decoration-break:clone}',
      '[data-stories-bottom-margin="1"] .recap-grid{display:block!important;padding-bottom:16mm}',
      '[data-story-card],.story-card{display:block!important;break-inside:avoid!important;page-break-inside:avoid!important;-webkit-column-break-inside:avoid;padding-bottom:20mm!important;margin-bottom:8mm;-webkit-box-decoration-break:clone;box-decoration-break:clone}',
      '[data-story-card] .body,.story-card .body{break-inside:avoid!important;page-break-inside:avoid!important;padding-bottom:12mm;orphans:4;widows:4}',
    ].join('');
  }

  function injectStoriesPrintCss() {
    if (!isPrintReport() || document.querySelector('style[data-ts-stories-margin="1"]')) return;
    const style = document.createElement('style');
    style.dataset.tsStoriesMargin = '1';
    style.textContent = storiesPrintCss();
    document.head.appendChild(style);
  }

  function mark(el, resolved) {
    if (!el || el.dataset.tsIconFixed === '1') return;
    if (/^H[1-6]$/.test(el.tagName)) return;
    if (el.closest('.print-media-card, .story-card, .logo-list, [data-trip-directory], [data-post-itinerary], [data-stories-up-front]')) return;
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
      }) || (el.previousElementSibling && !/^H[1-6]$/.test(el.previousElementSibling.tagName) ? el.previousElementSibling : null);
      if (iconEl) mark(iconEl, resolved);
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
    function stripPrintJunkMedia() {
      document.querySelectorAll('.print-media-card, .story-card figure').forEach((el) => {
        const img = el.querySelector('img');
        const blob = `${el.textContent || ''} ${img?.getAttribute('src') || ''} ${img?.getAttribute('alt') || ''}`;
        if (/bind[- ]?proof|neon file bind proof/i.test(blob)) el.remove();
      });
    }

    async function inlinePrintVideoQr() {
      const imgs = [...document.querySelectorAll('img.print-media-qr')];
      await Promise.all(imgs.map(async (img) => {
        if (img.dataset.tsQrInlined === '1') return;
        const src = img.getAttribute('src') || '';
        if (!/\/api\/pdf\/qr\.svg/i.test(src)) return;
        const url = new URL(src, location.origin);
        url.searchParams.set('m', '1');
        const qr = await fetch(url.toString(), { cache: 'reload' });
        if (!qr.ok) return;
        const svg = await qr.text();
        if (!/<svg[\s\S]*<rect/i.test(svg)) return;
        img.dataset.tsQrInlined = '1';
        img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
      }));
    }

    if (isPrintReport()) {
      injectStoriesPrintCss();
      stripPrintJunkMedia();
      inlinePrintVideoQr().catch(() => {});
      new MutationObserver(() => {
        stripPrintJunkMedia();
        inlinePrintVideoQr().catch(() => {});
      }).observe(document.body, { childList: true, subtree: true });
      return;
    }
    apply(lookup);
    repairStoryCards();
    new MutationObserver(() => {
      apply(lookup);
      repairStoryCards();
    }).observe(document.body, { childList: true, subtree: true });
  }

  injectStoriesPrintCss();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      injectStoriesPrintCss();
      boot().catch(() => {});
    }, { once: true });
  } else {
    boot().catch(() => {});
  }
})();
