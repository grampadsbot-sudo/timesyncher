window.tsBindOrderTestCouponCheckout = function bindOrderTestCouponCheckout(ctx) {
  const {
    form,
    bump,
    photoMemories,
    couponCode,
    payBtn,
    applyCouponBtn,
    completeZeroPurchaseBtn,
    formData,
    money,
    setStatus,
    hideStatus,
    preparePaymentElement,
    hasCouponDraft,
    getCouponQuote,
    setCouponQuote,
    clearCouponQuote,
    updateTotal,
    couponCheckout,
  } = ctx;

  function syncCouponPaymentUi() {
    const quote = getCouponQuote();
    const couponMode = hasCouponDraft();
    payBtn.hidden = couponMode;
    applyCouponBtn.hidden = !couponMode || Boolean(quote);
    completeZeroPurchaseBtn.hidden = !quote;
  }

  if (couponCheckout) couponCheckout.syncCouponPaymentUi = syncCouponPaymentUi;

  applyCouponBtn.addEventListener('click', async () => {
    if (!form.reportValidity()) return;
    applyCouponBtn.disabled = true;
    hideStatus();
    try {
      const response = await fetch('/api/checkout-coupon', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...formData(),
          action: 'validate_coupon',
          orderBump: bump.checked,
          photoMemories: photoMemories.checked,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) throw new Error(data.error || 'Coupon could not be applied.');
      setCouponQuote(data.order);
      const quote = getCouponQuote();
      completeZeroPurchaseBtn.textContent = `Complete ${money(quote.amountCents)} purchase`;
      setStatus(`Coupon applied. Review the order summary, then complete your ${money(quote.amountCents)} purchase.`, false);
      updateTotal();
      await preparePaymentElement();
    } catch (error) {
      clearCouponQuote();
      setStatus(error.message || 'Coupon could not be applied.', true);
      updateTotal();
    } finally {
      applyCouponBtn.disabled = false;
    }
  });

  completeZeroPurchaseBtn.addEventListener('click', async () => {
    const quote = getCouponQuote();
    if (!quote) return;
    if (!form.reportValidity()) return;
    completeZeroPurchaseBtn.disabled = true;
    completeZeroPurchaseBtn.textContent = 'Completing purchase...';
    hideStatus();
    try {
      const response = await fetch('/api/checkout-coupon', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...formData(), orderBump: bump.checked, photoMemories: photoMemories.checked }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) throw new Error(data.error || 'Coupon could not be redeemed.');
      setStatus('Coupon redeemed. Opening your TimeSyncher onboarding...', false);
      const nextUrl = data.session?.onboardingUrl
        || (data.session?.token ? `/order-success.html?session=${encodeURIComponent(data.session.token)}` : '')
        || data.onboarding?.onboardingUrl
        || '/order-success.html';
      window.location.href = nextUrl;
    } catch (error) {
      setStatus(error.message || 'Coupon could not be redeemed.', true);
      completeZeroPurchaseBtn.disabled = false;
      completeZeroPurchaseBtn.textContent = `Complete ${money(quote.amountCents)} purchase`;
    }
  });
};
