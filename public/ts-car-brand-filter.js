(function () {
  const removed = new Set();

  function brandFromVacationRow(row) {
    const nameEl = row.querySelector('[data-ts-list-row-name="1"]');
    if (nameEl) {
      const name = (nameEl.textContent || '').replace(/\s+/g, ' ').trim();
      if (name) return name;
    }
    const label = (row.innerText || '').replace(/\s+/g, ' ').trim();
    if (!label) return '';
    return label.split(' $')[0].trim();
  }

  function vacationCarRows() {
    const screen = document.querySelector('[data-shared-live-tab="cars"]');
    if (!screen) return [];
    return [...screen.querySelectorAll('[data-ts-list-row="1"].tsv-row-car, [data-ts-list-row="1"][data-list-row="1"]')].filter(
      (row) => row.classList.contains('tsv-row-car') || row.querySelector('.tsv-row-car-main'),
    );
  }

  function legacyCarRows() {
    return [...document.querySelectorAll('button, article, li')].filter((node) => {
      const label = (node.innerText || '').replace(/\s+/g, ' ').trim();
      if (!label || label.length > 80) return false;
      if (/^car type$/i.test(label) || /^cars$/i.test(label) || /^remove /i.test(label)) return false;
      const category = (node.closest('[data-category]')?.getAttribute('data-category') || '').toLowerCase();
      return category === 'car' || /\$\d+/.test(label);
    });
  }

  function carRows() {
    const vacation = vacationCarRows();
    if (vacation.length) return vacation;
    return legacyCarRows();
  }

  function brandFromRow(row) {
    if (row.matches?.('[data-ts-list-row="1"]')) {
      return brandFromVacationRow(row);
    }
    return (row.innerText || '').replace(/\s+/g, ' ').trim().split(' $')[0];
  }

  function carsTabActive() {
    if (document.querySelector('[data-shared-live-tab="cars"]')) return true;
    return /cars/i.test(document.body.innerText || '') && carRows().length > 0;
  }

  function mount() {
    if (!document.body) return;
    const onCars = carsTabActive() && carRows().length > 0;
    if (!onCars) {
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
    }
    const carsScreen = document.querySelector('[data-shared-live-tab="cars"]');
    if (carsScreen) {
      if (bar.parentNode !== carsScreen) {
        carsScreen.insertBefore(bar, carsScreen.firstChild);
      }
    } else if (bar.parentNode !== document.body) {
      document.body.prepend(bar);
    }
    const seen = new Set();
    for (const row of carRows()) {
      const brand = brandFromRow(row);
      const key = brand.toLowerCase();
      if (!brand || seen.has(key) || removed.has(key)) continue;
      seen.add(key);
      if (bar.querySelector(`[data-ts-remove-brand="${CSS.escape(brand)}"]`)) continue;
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.tsRemoveBrand = brand;
      button.setAttribute('aria-label', `Remove ${brand}`);
      button.textContent = `Remove ${brand}`;
      button.addEventListener('click', () => {
        removed.add(key);
        button.remove();
        for (const node of carRows()) {
          const rowBrand = brandFromRow(node).toLowerCase();
          if (rowBrand === key || rowBrand.startsWith(`${key} `)) node.style.display = 'none';
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
  document.addEventListener('DOMContentLoaded', () => mount());
  if (document.body) {
    const observer = new MutationObserver(() => mount());
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['data-shared-live-tab', 'class'],
    });
    mount();
  }
})();
