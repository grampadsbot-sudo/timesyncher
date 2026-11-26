const BARE_CHECKOUT = /(?<![\w/.-])checkout(?![\w/-]|\.\w)/gi;
const CHECK_OUT_TIME = /\bcheck\s+out(?=\s+times?\b)/gi;
const LODGING_CONTEXT = /\b(?:hotel|lodging|resort|motel|inn|room|suite|stay|rental|condo|villa|house|airbnb|check-in|check in|arrival|arrive|departure|depart|late|early|morning|afternoon|days?|times?|monday|tuesday|wednesday|thursday|friday|saturday|sunday|noon)\b|\bat\s+\d|\d\s*(?:a\.?m|p\.?m)\b/i;
const PAYMENT_CONTEXT = /\b(?:stripe|purchase|cart|billing|payments?|pay|card|coupon|subscription|order|page|link|buy|price|checkout\s+modules?)\b/i;
const SENTENCE = /[^.!?\n]+(?:[.!?]+|\n|$)/g;

function hyphenate(word) {
  return word[0] === 'C' ? 'Check-out' : 'check-out';
}

export function normalizeLodgingCheckoutWording(text) {
  const value = String(text || '');
  if (!/checkout|check\s+out\s+time/i.test(value)) return value;
  return value.replace(SENTENCE, (sentence) => {
    const timed = sentence.replace(CHECK_OUT_TIME, hyphenate);
    if (!LODGING_CONTEXT.test(timed) || PAYMENT_CONTEXT.test(timed)) return timed;
    return timed.replace(BARE_CHECKOUT, hyphenate);
  });
}
