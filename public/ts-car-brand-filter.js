(function () {
  const hidden = new Set();
  const knownBrands = new Map();

  function brandFromLogo(url = '') {
    const raw = String(url || '').trim();
    if (!raw) return '';
  try {
    const hostMatch = raw.match(/ip3\/([^.]+)\./i);
    const host = hostMatch ? hostMatch[1] : new URL(raw, 'https://x.test').hostname.replace(/^www\./i, '').split('.')[0];
    const key = String(host || '').toLowerCase();
    if (!key) return '';
    if (key === 'priceline') return 'Priceline opaque';
    return key.charAt(0).toUpperCase() + key.slice(1);
  } catch {
    return '';
  }
  }

  function rowCanonicalBrand(node) {
    const rental = String(node.getAttribute('data-rental-company') || '').trim();
    if (rental) return rental;

    const logoBrand = brandFromLogo(rowLogoSrc(node));
    if (logoBrand) return logoBrand;

    const nameEl = node.querySelector('[data-ts-list-row-name="1"]');
    const strong = nameEl ? nameEl.querySelector('strong') : null;
    let title = strong ? String(strong.textContent || '').trim() : String(nameEl?.textContent || '').trim();
    title = title.replace(/^[\p{Extended_Pictographic}\uFE0F\s]+/u, '').split('$')[0].trim();
    const head = title.split(/\s+\u2014\s+|\s+—\s+|\s+-\s+/)[0].trim();
    if (/^priceline/i.test(head)) return 'Priceline opaque';
    const sansJfk = head.replace(/\s+JFK$/i, '').trim();
    if (sansJfk && sansJfk.length < head.length) return sansJfk.charAt(0).toUpperCase() + sansJfk.slice(1);
    const first = head.split(/\s+/)[0];
    return first ? first.charAt(0).toUpperCase() + first.slice(1) : '';
  }

  function rowBrandKey(node) {
    return rowCanonicalBrand(node).toLowerCase();
  }

  function rowLogoSrc(node) {
    const fromRow = node.getAttribute('data-logo-src') || '';
    if (fromRow) return fromRow;
    const img = node.querySelector('img[data-logo-src]') || node.querySelector('img[src]');
    return img ? String(img.getAttribute('src') || img.getAttribute('data-logo-src') || '').trim() : '';
  }

  function resolvedBrandLogo(url = '') {
    const raw = String(url || '').trim();
    if (!raw) return '';
    try {
      const host = new URL(raw, 'https://x.test').hostname.replace(/^www\./i, '').toLowerCase();
      if (!host) return raw;
      if (/^(icons\.)?duckduckgo\.com$/i.test(host)) return raw;
      return `https://icons.duckduckgo.com/ip3/${host}.ico`;
    } catch {
      return raw;
    }
  }

  const CAR_CATEGORY_ICON_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#334155" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
    + '<path d="m21 8-2 2-1.5-3.7A2 2 0 0 0 15.646 5H8.4a2 2 0 0 0-1.903 1.257L5 10 3 8"/>'
    + '<path d="M7 14h.01"/><path d="M17 14h.01"/>'
    + '<rect width="18" height="8" x="3" y="10" rx="2"/>'
    + '<path d="M5 18v2"/><path d="M19 18v2"/>'
    + '</svg>';

  function categoryIconSrc() {
    return `data:image/svg+xml,${encodeURIComponent(CAR_CATEGORY_ICON_SVG)}`;
  }

  function mountBrandLogo(img, primary, rawLogo) {
    const categorySrc = categoryIconSrc();
    const resolved = resolvedBrandLogo(primary || rawLogo);
  if (!resolved) {
    img.src = categorySrc;
    img.dataset.tsBrandLogoFallback = 'category';
    return;
  }
  img.src = resolved;
  img.dataset.tsBrandLogoFallback = '0';
  const toCategory = () => {
    if (img.dataset.tsBrandLogoFallback === 'category') return;
    img.dataset.tsBrandLogoFallback = 'category';
    img.src = categorySrc;
  };
  img.addEventListener('error', () => {
    const stage = img.dataset.tsBrandLogoFallback || '0';
    if (stage === '0') {
      const raw = String(rawLogo || '').trim();
      const alt = resolvedBrandLogo(raw);
      if (raw && alt && alt !== img.src) {
        img.dataset.tsBrandLogoFallback = '1';
        img.src = alt;
        return;
      }
    }
    toCategory();
  });
  img.addEventListener('load', () => {
    if (img.dataset.tsBrandLogoFallback === 'category') return;
    if (img.naturalWidth < 16 || img.naturalHeight < 16) toCategory();
  });
  }

  function preferBrandLogo(prev, next) {
    const a = resolvedBrandLogo(prev);
    const b = resolvedBrandLogo(next);
    if (!b) return a;
    if (!a) return b;
    if (/duckduckgo\.com\/ip3\//i.test(b)) return b;
    return a;
  }

  function carRows() {
    return [
      ...document.querySelectorAll('li.tsv-row-car[data-ts-list-row="1"]'),
      ...document.querySelectorAll('li[data-list-row][data-thing-category="car"]'),
    ];
  }

  function activeTabLabel() {
    const selected = document.querySelector(
      'button[role="tab"][aria-selected="true"], [role="tab"][aria-selected="true"]',
    );
    if (selected) {
      return String(selected.getAttribute('aria-label') || selected.textContent || '').trim();
    }
    for (const btn of document.querySelectorAll('button[role="tab"], button')) {
      if (btn.getAttribute('aria-pressed') === 'true') {
        return String(btn.getAttribute('aria-label') || btn.textContent || '').trim();
      }
    }
    return '';
  }

  function carsTabActive() {
    const label = activeTabLabel();
    if (/^cars$/i.test(label)) return true;
    if (label) return false;
    const tabSelected = document.querySelector(
      'button[role="tab"][aria-selected="true"], [role="tab"][aria-selected="true"]',
    );
    if (tabSelected) return false;
    return carRows().length > 0;
  }

  function hideCarBrandBar() {
    document.querySelector('[data-ts-car-brands]')?.remove();
  }

  function rememberBrands(rows) {
    for (const row of rows) {
      const brand = rowCanonicalBrand(row);
      const key = rowBrandKey(row);
      if (!brand || !key) continue;
      const logo = resolvedBrandLogo(rowLogoSrc(row));
      const prev = knownBrands.get(key);
      const mergedLogo = preferBrandLogo(prev?.logo, logo);
      if (!prev) knownBrands.set(key, { label: brand, logo: mergedLogo });
      else if (mergedLogo && mergedLogo !== prev.logo) knownBrands.set(key, { label: brand, logo: mergedLogo });
    }
  }

  function applyVisibility() {
    for (const node of carRows()) {
      const key = rowBrandKey(node);
      node.style.display = key && hidden.has(key) ? 'none' : '';
    }
  }

  function mount() {
    if (!document.body) return;
    if (!carsTabActive()) {
      hideCarBrandBar();
      return;
    }
    const rows = carRows();
    if (rows.length) rememberBrands(rows);
    if (!knownBrands.size) {
      hideCarBrandBar();
      return;
    }

    const host =
      document.querySelector('[data-shared-live-tab="cars"]') ||
      document.getElementById('root') ||
      document.body;
    let bar = host.querySelector('[data-ts-car-brands]');
    if (!bar) {
      bar = document.createElement('div');
      bar.dataset.tsCarBrands = '1';
      bar.style.cssText =
        'display:flex;flex-wrap:wrap;gap:8px;padding:8px 12px;background:#fff;color:#111;position:relative;z-index:2;overflow-x:hidden;max-width:100%;box-sizing:border-box;';
      const title = document.createElement('div');
      title.textContent = 'Show car brands';
      title.style.cssText = 'flex:0 0 100%;font-size:12px;font-weight:700;';
      bar.appendChild(title);
      host.prepend(bar);
    }

    for (const [key, meta] of knownBrands) {
      const brand = meta.label;
      if (bar.querySelector(`[data-ts-brand-toggle="${CSS.escape(key)}"]`)) continue;
      const label = document.createElement('label');
      label.dataset.tsBrandToggle = key;
      label.style.cssText =
        'display:inline-flex;align-items:center;gap:6px;border:1px solid #e5e7eb;border-radius:999px;padding:5px 10px;font-size:11px;font-weight:700;cursor:pointer;max-width:100%;box-sizing:border-box;';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = !hidden.has(key);
      checkbox.setAttribute('aria-label', `Show ${brand} vehicles`);
      checkbox.style.cssText = 'margin:0;width:14px;height:14px;flex-shrink:0;';
      label.appendChild(checkbox);
      const img = document.createElement('img');
      img.alt = '';
      img.loading = 'lazy';
      img.style.cssText = 'width:18px;height:18px;object-fit:contain;flex-shrink:0;display:block;';
      mountBrandLogo(img, meta.logo, meta.logo);
      label.appendChild(img);
      const name = document.createElement('span');
      name.textContent = brand;
      name.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;';
      label.appendChild(name);
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) hidden.delete(key);
        else hidden.add(key);
        applyVisibility();
      });
      bar.appendChild(label);
    }

    applyVisibility();
  }

  function scheduleMount() {
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(mount);
    else mount();
  }

  window.__tsMountCarBrands = mount;
  document.addEventListener('click', (event) => {
    const tabBtn = event.target?.closest?.('button[role="tab"], [role="tab"]');
    if (tabBtn) {
      scheduleMount();
      return;
    }
    const text = (event.target?.innerText || event.target?.textContent || '').replace(/\s+/g, ' ').trim();
    if (/^cars\b/i.test(text) && text.length < 40) scheduleMount();
  });
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scheduleMount, { once: true });
  } else {
    scheduleMount();
  }
  new MutationObserver(scheduleMount).observe(document.documentElement, { childList: true, subtree: true });
})();
