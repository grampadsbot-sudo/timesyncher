(function () {
  const pool = [
    { brand: 'Alamo', price: 42 },
    { brand: 'Budget', price: 39 },
    { brand: 'Dollar', price: 36 },
    { brand: 'Enterprise', price: 48 },
    { brand: 'Hertz', price: 55 },
    { brand: 'National', price: 51 },
    { brand: 'Thrifty', price: 34 },
    { brand: 'Avis', price: 53 },
    { brand: 'Sixt', price: 61 },
    { brand: 'Payless', price: 33 },
    { brand: 'Fox', price: 37 },
    { brand: 'Ace', price: 44 },
    { brand: 'Europcar', price: 58 },
    { brand: 'Advantage', price: 40 },
  ];
  const removed = new Set();
  let carsOn = false;

  function cheapest(limit) {
    return pool
      .filter((offer) => !removed.has(offer.brand.toLowerCase()))
      .slice()
      .sort((left, right) => left.price - right.price || left.brand.localeCompare(right.brand))
      .slice(0, limit);
  }

  function carsOpen() {
    return carsOn;
  }

  function hideRemoved() {
    const names = new Set([...removed]);
    for (const node of document.querySelectorAll('button, div, li, article')) {
      const label = (node.innerText || '').replace(/\s+/g, ' ').trim();
      if (!label || label.length > 80) continue;
      const brand = [...names].find((name) => label.toLowerCase() === name || label.toLowerCase().startsWith(`${name} `));
      if (!brand) continue;
      node.dataset.tsCarHidden = '1';
      node.style.display = 'none';
    }
  }

  function showNext() {
    const host = document.querySelector('[data-ts-car-results]');
    if (!host) return;
    host.replaceChildren();
    for (const offer of cheapest(10)) {
      const row = document.createElement('div');
      row.dataset.tsCarOffer = offer.brand;
      row.textContent = `${offer.brand} $${offer.price}`;
      host.appendChild(row);
    }
  }

  function mount() {
    if (!document.body) return;
    if (!carsOpen()) {
      document.querySelector('[data-ts-car-brands]')?.remove();
      return;
    }
    if (document.querySelector('[data-ts-car-brands]')) {
      hideRemoved();
      return;
    }
    const bar = document.createElement('div');
    bar.dataset.tsCarBrands = '1';
    bar.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;padding:8px 12px;background:#fff;color:#111;position:relative;z-index:30;';
    const title = document.createElement('div');
    title.textContent = 'Remove a brand';
    bar.appendChild(title);
    const results = document.createElement('div');
    results.dataset.tsCarResults = '1';
    for (const offer of cheapest(10)) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.tsRemoveBrand = offer.brand;
      button.textContent = `Remove ${offer.brand}`;
      button.addEventListener('click', () => {
        removed.add(offer.brand.toLowerCase());
        button.hidden = true;
        hideRemoved();
        showNext();
      });
      bar.appendChild(button);
    }
    bar.appendChild(results);
    showNext();
    document.body.prepend(bar);
  }

  document.addEventListener('click', (event) => {
    const label = (event.target && event.target.innerText || '').replace(/\s+/g, ' ').trim();
    if (label === 'Cars') carsOn = true;
    if (['Day-by-Day', 'Flights', 'Hotels', 'Restaurants', 'Stores', 'The Rest', 'Budget'].includes(label)) carsOn = false;
    mount();
  }, true);
  const observer = new MutationObserver(() => mount());
  if (document.body) observer.observe(document.body, { childList: true, subtree: true });
  else document.addEventListener('DOMContentLoaded', () => observer.observe(document.body, { childList: true, subtree: true }));
  mount();
})();
