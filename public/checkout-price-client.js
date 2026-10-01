function tsCreateCatalogLoader(applyProductCopy) {
  let productCatalogPromise;
  return function loadProductCatalog() {
    if (!productCatalogPromise) {
      productCatalogPromise = fetch('/api/checkout-products').then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.ok) throw new Error(data.error || 'Checkout prices are not configured yet.');
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
    ctx.setStatus(error.message || 'Checkout prices are not configured yet.', true);
    ctx.continueBtn.disabled = true;
    if (ctx.step2Pill) ctx.step2Pill.disabled = true;
  });
  return loadProductCatalog;
}
