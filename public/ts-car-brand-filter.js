(function () {
  const removed = new Set();

  function carsTabActive() {
    return [...document.querySelectorAll('button,[role="tab"]')].some((node) => {
      if (node.getAttribute('aria-label') !== 'Cars') return false;
      const selected = node.getAttribute('aria-selected');
      if (selected === 'true') return true;
      if (selected === 'false') return false;
      const style = window.getComputedStyle(node);
      return style && parseInt(style.fontWeight, 10) >= 700;
    });
  }

  function carRows() {
    if (!carsTabActive()) return [];
    const panel = document.querySelector('[data-shared-live-tab="cars"]');
    const scope = panel || document;
    return [...scope.querySelectorAll('[data-list-row="1"], button, article, li')].filter((node) => {
      if (node.closest('[data-ts-car-brands]')) return false;
      const category = (
        node.getAttribute('data-thing-category') ||
        node.closest('[data-thing-category]')?.getAttribute('data-thing-category') ||
        ''
      ).toLowerCase();
      if (category && category !== 'car') return false;
      const label = (node.innerText || '').replace(/\s+/g, ' ').trim();
      if (!label || label.length > 80) return false;
      if (/^car type$/i.test(label) || /^cars$/i.test(label) || /^remove /i.test(label)) return false;
      return category === 'car';
    });
  }

  function mount() {
    if (!document.body) return;
    if (!carsTabActive() || carRows().length === 0) {
      document.querySelector('[data-ts-car-brands]')?.remove();
      return;
    }
    let bar = document.querySelector('[data-ts-car-brands]');
    if (!bar) {
      bar = document.createElement('div');
      bar.dataset.tsCarBrands = '1';
      bar.style.cssText =
        'display:flex;flex-wrap:wrap;gap:8px;padding:8px 12px;background:#fff;color:#111;position:relative;z-index:30;';
      const title = document.createElement('div');
      title.textContent = 'Remove a brand';
      bar.appendChild(title);
      const carsPanel = document.querySelector('[data-shared-live-tab="cars"]');
      if (carsPanel) carsPanel.prepend(bar);
      else document.body.prepend(bar);
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
  document.addEventListener(
    'click',
    (event) => {
      const tab = event.target?.closest?.('button,[role="tab"]');
      if (!tab) return;
      const label = tab.getAttribute('aria-label') || (tab.innerText || tab.textContent || '').replace(/\s+/g, ' ').trim();
      if (/^(day-by-day|flights|hotels|cars|restaurants|stores|the rest|budget)\b/i.test(label)) {
        queueMicrotask(mount);
      }
    },
    true,
  );
})();
