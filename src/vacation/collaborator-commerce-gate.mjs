const COLLABORATOR_COMMERCE_NEEDLE_PATTERNS = [
  /\bcheckout\b/i,
  /\bupgrade\b/i,
  /\bunlimited\b/i,
  /\$\s?\d/,
  /\bplan single\b/i,
  /\bplan owner_media\b/i,
  /configured checkout/i,
  /purchase_receipts/i,
  /order bump/i,
  /per collaborator seat/i,
  /dollars_per_collaborator_seat/i,
  /TIMESYNCHER_(SINGLE|UNLIMITED|COLLABORATOR|ORDER_BUMP|MEDIA)_/i,
  /purchase email/i,
  /Plan Collaborator seat lets the owner/i,
  /Checkout offers four plans/i,
];

function collaboratorCommerceNeedles(text = '') {
  const haystack = String(text || '');
  return COLLABORATOR_COMMERCE_NEEDLE_PATTERNS
    .filter((pattern) => pattern.test(haystack))
    .map((pattern) => String(pattern));
}

export function assertNoCollaboratorCommerceNeedles(text = '', label = 'surface') {
  const hits = collaboratorCommerceNeedles(text);
  if (!hits.length) return;
  const error = new Error(`collaborator_commerce_needle:${label}`);
  error.code = 'collaborator_commerce_needle';
  error.label = label;
  error.hits = hits;
  throw error;
}
