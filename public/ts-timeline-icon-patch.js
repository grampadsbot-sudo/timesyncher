(() => {
  const sharedMatch = location.pathname.match(/^\/shared\/([^/]+)/);
  if (!sharedMatch) return;

  const token = decodeURIComponent(sharedMatch[1]);
  const AIRPLANE = /\u2708\uFE0F?|\u2708|✈️|^plane$/i;

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then((regs) => regs.forEach((reg) => reg.unregister()));
    if (window.caches) caches.keys().then((keys) => keys.forEach((key) => caches.delete(key)));
  }

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
    const params = new URLSearchParams(location.search);
    if (params.get('printMode') === 'report') return true;
    const style = params.get('style');
    return /\/journey\/?$/.test(location.pathname || '') && (style === '2' || style === 'style-2');
  }

  function storiesPrintCss() {
    return [
      '@page{size:Letter;margin-top:0;margin-bottom:16mm;margin-left:9mm;margin-right:9mm;@top-left{content:none}@top-right{content:none}@top-center{content:none}@bottom-left{content:none}@bottom-right{content:none}@bottom-center{content:"Page " counter(page) " of " counter(pages);font-size:10pt;text-align:center}}',
      '[data-print-title="1"],.ts-print-header,h1{string-set:print-title content()}',
      '[data-print-chrome-header="1"],.ts-print-header{position:fixed;top:4mm;left:0;right:0;text-align:center;font-size:11pt;font-weight:600;color:#111827;z-index:2147483646;pointer-events:none}',
      '[data-print-chrome-footer="1"]{position:fixed;bottom:3mm;left:0;right:0;text-align:center;font-size:10pt;color:#111827;z-index:2147483646;pointer-events:none}',
      '.pdf-page-counter,.page-count,.muted.page-count{display:none!important;position:static!important}',
      '.style2-thing,.thing.style2-thing{position:relative!important;padding:12px!important;padding-right:12px!important;display:flex!important;flex-direction:column!important}',
      '.style2-thing-meta,.style2-thing .style2-thing-meta{position:static!important;top:auto!important;right:auto!important;width:auto!important;max-width:100%!important;margin:0 0 2px!important;text-align:left!important;white-space:normal}',
      '@media print{.daily-page,.style2-page{height:auto!important;min-height:0!important;overflow:visible!important}.daily-details,[data-day-things-flow="1"]{display:grid!important;grid-template-columns:1fr 1fr!important}}',
      '.style2-thing .thing-head{min-width:0!important;padding-right:0!important}',
      '.style2-thing .thing-head h3,.style2-thing h3{max-width:100%!important;padding-right:0!important;overflow-wrap:anywhere}',
      '.page,.daily-page,.keepsake-report,.style2-page{padding:18mm 9mm 12mm 9mm!important;box-sizing:border-box;-webkit-box-decoration-break:clone;box-decoration-break:clone}',
      '.print-brand,.print-brand .ts-logo,img.pdf-final-logo{display:none!important}',
      '[data-last-content-page="1"]{padding-bottom:22mm!important}',
      '[data-last-page-logo="1"]{display:flex!important;flex-direction:column;align-items:center;justify-content:flex-end;text-align:center;width:100%;margin-top:10mm;padding:4mm 0 2mm;break-before:avoid;page-break-before:avoid}',
      '[data-last-page-logo="1"] .ts-logo{display:block!important;width:56px;height:56px;margin:0 auto 8px;object-fit:contain}',
      '[data-stories-two-col="1"] .recap-grid,[data-stories-packed="1"] .recap-grid,.recap-grid[data-stories-grid="2"]{display:grid!important;grid-template-columns:1fr 1fr!important;gap:8px 12px!important;align-items:start!important}',
      '[data-stories-two-col="1"] .story-card,[data-stories-packed="1"] .story-card,[data-story-card]{width:auto!important;max-width:100%!important;min-width:0!important;break-inside:auto;page-break-inside:auto}',
      'main.style2-details[data-day-things-flow="1"],main.daily-details[data-day-things-flow="1"],[data-day-things-flow="1"]{display:grid!important;grid-template-columns:1fr 1fr!important;gap:8px 12px!important;align-items:start!important}',
      '[data-day-things-flow="1"] .thing,[data-day-things-flow="1"] .style2-thing,[data-day-things-flow="1"] .daily-thing{width:auto!important;max-width:100%!important;min-width:0!important;padding-right:0!important;margin:0 0 8px!important}',
      '.style2-page{height:auto!important;min-height:0!important;overflow:visible!important;display:block!important;text-align:center!important}',
      '[data-style2-centered-day]{display:block!important;break-after:page!important;page-break-after:always!important}',
      '.style2-day-opening{display:block!important;text-align:center!important;margin:0 auto 16px!important;max-width:560px!important;width:100%}',
      '.style2-timeline{display:inline-grid!important;margin:0 auto!important;text-align:left}',
      '.style2-details{width:100%!important;text-align:left!important;clear:both!important}',
      '.style2-page .daily-grid,.style2-page .daily-left{display:none!important}',
      '[data-end-two-col="1"] .logo-list,.logo-list[data-end-list="1"],[data-trip-directory="1"] .logo-list{display:grid!important;grid-template-columns:1fr 1fr!important;gap:8px 18px!important;columns:unset!important}',
      '[data-post-itinerary="1"]{break-before:page!important;page-break-before:always!important}',
      '[data-endlist-maps="0"] .map-box,[data-post-itinerary="1"] .map-box,[data-end-continuous="1"] .map-box{display:none!important}',
      '[data-end-continuous="1"] .report-section{break-inside:auto;page-break-inside:auto;break-before:auto;page-break-before:auto}',
      '[data-end-continuous="1"] .report-section>h2{break-after:avoid;page-break-after:avoid}',
      '[data-end-continuous="1"] .logo-list>li{break-inside:avoid;page-break-inside:avoid}',
      '.keepsake-day:last-child .daily-page:not(.daily-map-page):not([data-day-map-page]),.keepsake-day:last-of-type .daily-page:not(.daily-map-page):not([data-day-map-page]){min-height:0!important}',
      '.print-media-card{display:block!important;margin:0 0 8px;max-width:100%;width:auto}',
      '.print-media-card>img{width:100%;max-width:100%;height:auto!important;max-height:110px!important;object-fit:contain!important}',
      '.style2-page .print-media-card.video,.daily-page .print-media-card.video,.style2-day-media .print-media-card.video{display:none!important}',
      '.daily-map-page,[data-day-map-page="1"]{break-before:page!important;page-break-before:always!important;break-after:page!important;page-break-after:always!important;min-height:100vh!important;height:100vh!important;overflow:hidden!important;display:flex!important;flex-direction:column!important}',
      '.daily-map-page .map-box,[data-day-map-page="1"] .map-box{flex:1 1 auto!important;width:100%;min-height:0!important}',
    ].join('');
  }

  function injectStoriesPrintCss() {
    if (!isPrintReport() || document.querySelector('style[data-ts-stories-margin="1"]')) return;
    const style = document.createElement('style');
    style.dataset.tsStoriesMargin = '1';
    style.textContent = storiesPrintCss();
    document.head.appendChild(style);
  }

  function isTinyIconSlot(el) {
    if (!el || !el.getBoundingClientRect) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width > 48 || rect.height > 48) return false;
    const label = text(el.textContent);
    if (label.length > 8 && !AIRPLANE.test(label)) return false;
    return true;
  }

  function mark(el, resolved) {
    if (!el || el.dataset.tsIconFixed === '1') return;
    if (/^H[1-6]$/.test(el.tagName)) return;
    if (el.closest('.print-media-card, .story-card, .logo-list, [data-trip-directory], [data-post-itinerary], [data-stories-up-front]')) return;
    if (!isTinyIconSlot(el)) return;
    el.dataset.tsIconFixed = '1';
    el.dataset.tsIconType = resolved.type;
    if (resolved.logoUrl && !resolved.isFlight) {
      el.textContent = '';
      const img = document.createElement('img');
      img.src = resolved.logoUrl;
      img.alt = '';
      img.className = 'tiny-logo';
      img.style.width = '22px';
      img.style.height = '22px';
      img.style.maxWidth = '22px';
      img.style.maxHeight = '22px';
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
      document.title = String(document.title || '')
        .replace(/^TimeSyncher Vacation\s*[—–-]\s*/gi, '')
        .replace(/\s+(Summary|Keepsake Style 2)$/i, '')
        .trim() || 'Vacation';
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
