const LODGING_CHECKOUT_TIME = /\bcheckout\s+times?\b/gi;
const LODGING_CHECK_OUT_TIME = /\bcheck\s+out\s+times?\b/gi;
const ARRIVAL_OR_CHECKOUT = /\b(arrival|check-in)\s+or\s+checkout\b/gi;
const HOTEL_ARRIVAL_OR_CHECKOUT = /\bhotel\s+arrival\s+or\s+checkout\b/gi;
const AFTER_LODGING_CHECKOUT = /\bafter\s+checkout\b/gi;
const LODGING_CONTEXT_CHECKOUT = /(?<=(?:\bhotel\b|\blodging\b|\bstay\b|\barrival\b|\bcheck-in\b)[^.!?]{0,72}\s)checkout\b/gi;

const PAYMENT_CHECKOUT_PAGE = /\b(?:the\s+)?checkout\s+page\b/i;
const STRIPE_CHECKOUT = /\bstripe\s+checkout\b/i;

export function normalizeLodgingCheckoutWording(text) {
  let value = String(text || '');
  if (!/\bcheckout\b/i.test(value) && !/\bcheck\s+out\s+time/i.test(value)) return value;
  if (PAYMENT_CHECKOUT_PAGE.test(value) || STRIPE_CHECKOUT.test(value)) return value;
  value = value.replace(LODGING_CHECK_OUT_TIME, (match) => match.replace(/\bcheck\s+out\b/i, 'check-out'));
  value = value.replace(LODGING_CHECKOUT_TIME, (match) => match.replace(/\bcheckout\b/i, 'check-out'));
  value = value.replace(HOTEL_ARRIVAL_OR_CHECKOUT, (match) => match.replace(/\bcheckout\b/i, 'check-out'));
  value = value.replace(ARRIVAL_OR_CHECKOUT, (match) => match.replace(/\bcheckout\b/i, 'check-out'));
  value = value.replace(LODGING_CONTEXT_CHECKOUT, 'check-out');
  value = value.replace(AFTER_LODGING_CHECKOUT, 'after check-out');
  return value;
}