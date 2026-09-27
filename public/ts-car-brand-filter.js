(function () {
  const removed = new Set();

  function carRows() {
    return [...document.querySelectorAll('button, article, li')].filter((node) => {
      const label = (node.innerText || '').replace(/\s+/g, ' ').trim();
      if (!label || label.length > 80) return false;
      if (/^car type$/i.test(label)) return false;
      const category = (node.closest('[data-category]')?.getAttribute('data-category') || '').toLowerCase();
      return category === 'car' || /\$\d+/.test(label);
    });
  }

  function mount() {
    if (!document.body) return;
    const onCars = /cars/i.test(document.body.innerText || '') && carRows().length > 0;
    if (!onCars) {
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
    for (const row of carRows()) {
      const brand = (row.innerText || '').replace(/\s+/g, ' ').trim().split(' $')[0];
      const key = brand.toLowerCase();
      if (!brand || seen.has(key) || removed.has(key)) continue;
      seen.add(key);
      if (bar.querySelector(`[data-ts-remove-brand="${CSS.escape(brand)}"]`)) continue;
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.tsRemoveBrand = brand;
      button.textContent = `Remove ${brand}`;
      button.addEventListener('click', () => {
        removed.add(key);
        button.remove();
        for (const node of carRows()) {
          const label = (node.innerText || '').replace(/\s+/g, ' ').trim().toLowerCase();
          if (label === key || label.startsWith(`${key} `)) node.style.display = 'none';
        }
      });
      bar.appendChild(button);
    }
  }

  window.__tsMountCarBrands = mount;
  document.addEventListener('click', (event) => {
    const text = (event.target?.innerText || event.target?.textContent || '').replace(/\s+/g, ' ').trim();
    if (/^cars\b/i.test(text) && text.length < 40) mount();
  });
})();
