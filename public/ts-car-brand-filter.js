(function () {
  const removed = new Set();

  function rowBrandName(node) {
    const nameEl = node.querySelector('[data-ts-list-row-name="1"]');
    let brand = nameEl ? nameEl.textContent : node.innerText;
    brand = String(brand || '').replace(/\s+/g, ' ').trim();
    brand = brand.replace(/^[\p{Extended_Pictographic}\uFE0F\s]+/u, '').split(' $')[0].trim();
    return brand;
  }

  function carRows() {
    const marked = [...document.querySelectorAll('li[data-list-row][data-thing-category="car"]')];
    if (marked.length) return marked;
    return [...document.querySelectorAll('button, article, li')].filter((node) => {
      const label = (node.innerText || '').replace(/\s+/g, ' ').trim();
      if (!label || label.length > 80) return false;
      if (/^car type$/i.test(label) || /^cars$/i.test(label) || /^remove /i.test(label)) return false;
      const category = (node.closest('[data-category]')?.getAttribute('data-category') || '').toLowerCase();
      return category === 'car' || /\$\d+/.test(label);
    });
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
    if (!rows.length) {
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
    const seen = new Set();
    for (const row of rows) {
      const brand = rowBrandName(row);
      const key = brand.toLowerCase();
      if (!brand || seen.has(key) || removed.has(key)) continue;
      seen.add(key);
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
    if (/^cars\b/i.test(text) && text.length < 40) scheduleMount();
  });
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scheduleMount, { once: true });
  } else {
    scheduleMount();
  }
  new MutationObserver(scheduleMount).observe(document.documentElement, { childList: true, subtree: true });
})();
