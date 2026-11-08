(function () {
  const removed = new Set();
  const knownBrands = new Map();

  function rowBrandName(node) {
    const nameEl = node.querySelector('[data-ts-list-row-name="1"]');
    const strong = nameEl ? nameEl.querySelector('strong') : null;
    let short = strong ? String(strong.textContent || '').trim() : String(nameEl?.textContent || '').trim();
    short = short.replace(/^[\p{Extended_Pictographic}\uFE0F\s]+/u, '').split('$')[0].trim();

    const blob = `${node.innerText || ''} ${node.querySelector('[data-ts-list-desc="1"]')?.textContent || ''}`.toLowerCase();
    const atJfk = /\bjfk\b/.test(blob);
    if (short) {
      if (/priceline/i.test(short)) return short;
      if (atJfk && !/\bjfk\b/i.test(short)) return `${short} JFK`;
      return short;
    }

    const line = String(node.innerText || '')
      .replace(/\s+/g, ' ')
      .trim()
      .split(/\s+\$/)[0]
      .split('$')[0]
      .replace(/^[\p{Extended_Pictographic}\uFE0F\s]+/u, '')
      .trim();
    const emDash = line.split(' \u2014 ')[0].split(' — ')[0].trim();
    if (!emDash) return '';
    if (/priceline/i.test(emDash)) return emDash;
    if (atJfk && !/\bjfk\b/i.test(emDash)) return `${emDash} JFK`;
    return emDash;
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
      const brand = rowBrandName(row);
      const key = brand.toLowerCase();
      if (brand) knownBrands.set(key, brand);
    }
  }

  function removeControlLabel(brand) {
    return `Remove 🚗 ${brand}`;
  }

  function rowMatchesBrand(node, brandKey) {
    const name = rowBrandName(node).toLowerCase();
    if (!name) return false;
    if (name === brandKey) return true;
    const label = (node.innerText || '').replace(/\s+/g, ' ').trim().toLowerCase();
    return label.startsWith(`${brandKey} `) || label.includes(` ${brandKey} `);
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
      title.textContent = 'Remove a brand';
      title.style.cssText = 'flex:0 0 100%;font-size:12px;font-weight:700;';
      bar.appendChild(title);
      host.prepend(bar);
    }

    for (const [key, brand] of knownBrands) {
      if (removed.has(key)) continue;
      if (bar.querySelector(`[data-ts-remove-brand="${CSS.escape(brand)}"]`)) continue;
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.tsRemoveBrand = brand;
      const label = removeControlLabel(brand);
      button.textContent = label;
      button.setAttribute('aria-label', label);
      button.addEventListener('click', () => {
        removed.add(key);
        button.remove();
        for (const node of carRows()) {
          if (rowMatchesBrand(node, key)) node.style.display = 'none';
        }
      });
      bar.appendChild(button);
    }
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
