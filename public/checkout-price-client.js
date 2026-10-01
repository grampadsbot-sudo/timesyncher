const TS_PRICING_UNAVAILABLE = 'Prices are unavailable right now; please try again later.';

function tsPricedCents(amount, configKey) {
  const cents = Number(amount);
  if (!Number.isInteger(cents) || cents <= 0) {
    console.error(`checkout config missing: ${configKey}`);
    throw new Error(TS_PRICING_UNAVAILABLE);
  }
  return cents;
}

function tsCreateCatalogLoader(applyProductCopy) {
  let productCatalogPromise;
  return function loadProductCatalog() {
    if (!productCatalogPromise) {
      productCatalogPromise = fetch('/api/checkout-products').then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.ok) {
          const raw = data.error || 'checkout products unavailable';
          console.error(raw);
          throw new Error(TS_PRICING_UNAVAILABLE);
        }
        applyProductCopy(data);
        return data;
      });
    }
    return productCatalogPromise;
  };
}

function tsBootCheckoutCatalog(ctx) {
  const loadProductCatalog = tsCreateCatalogLoader(ctx.applyProductCopy);
  loadProductCatalog().catch((error) => {
    console.error(error);
    ctx.setStatus(error.message || 'Prices are unavailable right now; please try again later.', true);
    ctx.continueBtn.disabled = true;
    if (ctx.step2Pill) ctx.step2Pill.disabled = true;
  });
  return loadProductCatalog;
}

globalThis.TS_PRICING_UNAVAILABLE = TS_PRICING_UNAVAILABLE;
globalThis.tsPricedCents = tsPricedCents;