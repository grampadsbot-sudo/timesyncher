function tsCreateCatalogLoader(applyProductCopy) {
  let productCatalogPromise;
  return function loadProductCatalog() {
    if (!productCatalogPromise) {
      productCatalogPromise = fetch('/api/checkout-products').then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.ok) {
          console.error(data.error || 'checkout products unavailable');
          throw new Error('Prices are unavailable right now; please try again later.');
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
