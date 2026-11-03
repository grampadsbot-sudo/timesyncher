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
    const marked = [...document.querySelectorAll('li[data-list-row][data-thing-category="car"]')];
    if (marked.length) return marked;
    return [...document.querySelectorAll('button, article, li')].filter((node) => {
      const label = (node.innerText || '').replace(/\s+/g, ' ').trim();
      if (!label || label.length > 80) return false;
      if (/^car type$/i.test(label) || /^cars$/i.test(label) || /^remove /i.test(label)) return false;
      const rowCategory = (node.closest('[data-thing-category]')?.getAttribute('data-thing-category') || '').toLowerCase();
      if (rowCategory && rowCategory !== 'car') return false;
      const category = (node.closest('[data-category]')?.getAttribute('data-category') || '').toLowerCase();
      return category === 'car' || /\$\d+/.test(label);
    });
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
    const rows = carRows();
    if (rows.length) rememberBrands(rows);
    if (!knownBrands.size) {
      document.querySelector('[data-ts-car-brands]')?.remove();
      return;
    }

    let bar = document.querySelector('[data-ts-car-brands]');
    if (!bar) {
      bar = document.createElement('div');
      bar.dataset.tsCarBrands = '1';
      bar.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;padding:8px 12px;background:#fff;color:#111;position:relative;z-index:30;';
      const title = document.createElement('div');
      title.textContent = 'Remove a brand';
      bar.appendChild(title);
      document.body.prepend(bar);
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
    const text = (event.target?.innerText || event.target?.textContent || '').replace(/\s+/g, ' ').trim();
    if (/^(cars|budget)\b/i.test(text) && text.length < 40) scheduleMount();
  });
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scheduleMount, { once: true });
  } else {
    scheduleMount();
  }
  new MutationObserver(scheduleMount).observe(document.documentElement, { childList: true, subtree: true });
})();
