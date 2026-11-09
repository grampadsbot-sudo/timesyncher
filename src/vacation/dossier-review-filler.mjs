const COMPOSED_REVIEW_FILLER_RE = /\s*Guests note this theme repeatedly across the saved review evidence for this place\.?/gi;
export function stripComposedReviewFiller(text) {
  let body = String(text || '');
  if (!/saved review evidence|Guests note this theme repeatedly/i.test(body)) return body;
  return body.replace(COMPOSED_REVIEW_FILLER_RE, ' ').replace(/\s+/g, ' ').replace(/\.\s*\./g, '.').trim();
}

export function reviewTextsHaveRepeatedTrailingSentence(texts = []) {
  const trails = [];
  for (const raw of texts) {
    const t = String(raw || '').trim();
    if (!t) continue;
    const parts = t.replace(/[!?]/g, '.').split('.').map((p) => p.trim()).filter(Boolean);
    if (parts.length) trails.push(parts[parts.length - 1].toLowerCase());
  }
  const counts = new Map();
  for (const s of trails) counts.set(s, (counts.get(s) || 0) + 1);
  for (const [s, n] of counts) {
    if (n >= 2 && s.length >= 12) return s;
  }
  return null;
}

