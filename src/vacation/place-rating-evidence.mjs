export function placeRatingEvidence(override) {
  const d = override && typeof override === 'object' ? override : {};
  const sources = [
    ['restaurantji', 'Restaurantji'],
    ['opentable', 'OpenTable'],
    ['tripadvisor', 'Tripadvisor'],
    ['yelp', 'Yelp'],
    ['google', 'Google'],
    ['booking.com', 'Booking.com'],
    ['expedia', 'Expedia'],
    ['trip.com', 'Trip.com'],
  ];
  const stop = new Set(['hotel', 'the', 'and', 'new', 'york', 'nyc', 'cafe', 'club', 'restaurant', 'street', 'square', 'times', 'market', 'house', 'suites', 'city', 'center', 'centre', 'park']);
  const value = '([1-5]\\.\\d|[1-5](?=\\s*(?:out of 5|of 5|\\/\\s*5|stars?\\b|★|from\\s+\\d)))(?![.,]?\\d)';
  const tenFromReviews = '(\\d+(?:\\.\\d+)?)(?=\\s+from\\s+\\d)';
  const phrases = [
    new RegExp(`\\brat(?:e|es|ed)\\s+(?:[^\\d.!?]{0,80}?\\s)?${value}`, 'gi'),
    new RegExp(`\\brat(?:e|es|ed)\\s+(?:[^\\d.!?]{0,120}?\\s)${tenFromReviews}\\s+from\\s+\\d`, 'gi'),
    new RegExp(`\\bshows\\s+${value}`, 'gi'),
    new RegExp(`\\bscores?\\s+(?:it\\s+)?${value}`, 'gi'),
    new RegExp(`\\blists\\b[^\\d.!?]{0,80}?\\bat\\s+${value}`, 'gi'),
    /\b(\d+(?:\.\d+)?)\s*\/\s*10\b/gi,
  ];
  const unfetched = /\bsnapshots?\b|\bnot a live fetch\b/i;
  const str = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();
  const norm = (v) => str(v).toLowerCase().replace(/[’‘`]/g, "'").replace(/[^a-z0-9]+/g, ' ').trim();
  const num = (raw) => {
    const m = str(raw).match(/^(\d+(?:\.\d+)?)/);
    if (!m) return null;
    const n = Number(m[1]);
    return Number.isFinite(n) && n >= 1 && n <= 5 ? n : null;
  };
  const scaledOverall = (raw) => {
    const m = str(raw).match(/^(\d+(?:\.\d+)?)/);
    if (!m) return null;
    const n = Number(m[1]);
    if (!Number.isFinite(n)) return null;
    if (n >= 1 && n <= 5) return n;
    if (n > 5 && n <= 10) return Math.min(5, n / 2);
    return null;
  };
  const whole = (raw) => {
    const m = str(raw).match(/^\d[\d,]*$/);
    return m ? Number(m[0].replace(/,/g, '')) || null : null;
  };
  const tailCount = (raw) => {
    const m = str(raw).match(/^[^\d.!?]{0,30}?\(?(\d{1,3}(?:,\d{3})+|\d+)\)?(?=\s*(?:reviews?\b|ratings?\b|\)|$|[\s,.;]))/i);
    return m ? Number(m[1].replace(/,/g, '')) || null : null;
  };
  const sourceOf = (raw) => {
    const t = str(raw).toLowerCase();
    let best = null;
    for (const [key, label] of sources) {
      const at = t.lastIndexOf(key);
      if (at >= 0 && (!best || at > best.at)) best = { at, label };
    }
    return best ? best.label : '';
  };
  const cites = [];
  const seen = new Set();
  for (const origin of ['summary', 'longDetails', 'description']) {
    const body = str(d[origin]);
    if (!body || seen.has(body)) continue;
    seen.add(body);
    const clauses = body.split(/(?<=[.!?])\s+(?=[A-Z"“(])/).flatMap((s) => s.split(/,\s+(?=(?:while|whereas|but|though|although)\b)|;\s+/));
    for (const clause of clauses) {
      const snapshot = unfetched.test(clause);
      phrases.forEach((re, kind) => {
        for (const m of clause.matchAll(re)) {
          const rating = kind === 1 || kind === 5 ? scaledOverall(m[1]) : num(m[1]);
          if (rating == null) continue;
          const end = m.index + m[0].length;
          cites.push({
            rating,
            count: tailCount(clause.slice(end)),
            source: sourceOf(clause.slice(0, end)) || sourceOf(clause),
            origin,
            body,
            kind,
            snapshot,
          });
        }
      });
    }
  }
  for (const c of cites) {
    if (cites.some((s) => s.snapshot && s.source === c.source && Math.abs(s.rating - c.rating) < 0.05)) c.snapshot = true;
  }
  const narrative = ['summary', 'longDetails', 'description'].map((k) => str(d[k])).join(' ');
  const missing = Array.isArray(d.missingFields) ? d.missingFields.map((row) => str(row).toLowerCase()) : [];
  const flagged = missing.includes('ratings');
  const fieldOk = (raw) => {
    const rating = num(raw);
    if (rating == null || !flagged) return rating;
    const text = str(raw);
    if (/^\d$/.test(text) && new RegExp(`(?:^|[^\\d.,])${text}(?:,\\d{3}\\b|\\s+(?:reviews?|ratings?|photos?|votes?)\\b)`, 'i').test(narrative)) return null;
    const same = cites.filter((c) => Math.abs(c.rating - rating) < 0.05);
    return same.length && same.every((c) => c.snapshot) ? null : rating;
  };
  const fields = [];
  const thirdParty = sourceOf(d.thirdPartySource);
  for (const [key, countKey, source] of [
    ['googleRating', 'googleReviewCount', 'Google'],
    ['yelpRating', 'yelpReviewCount', 'Yelp'],
    ['thirdPartyRating', 'thirdPartyReviewCount', thirdParty],
    ['rating', 'ratingCount', thirdParty],
  ]) {
    const rating = fieldOk(d[key]);
    if (rating != null) fields.push({ rating, count: whole(d[countKey]), source, origin: key });
  }
  for (const site of Array.isArray(d.otherRatingSites) ? d.otherRatingSites : []) {
    if (!site || typeof site !== 'object' || Number(site.scaleMax || 5) !== 5) continue;
    const rating = fieldOk(site.average ?? site.rating ?? site.value);
    if (rating != null) fields.push({ rating, count: whole(site.count ?? site.reviewCount), source: sourceOf(site.name), origin: 'otherRatingSites' });
  }
  const title = norm(d.title || d.name);
  const tokens = title.split(' ').filter((t) => t.length >= 4 && !stop.has(t));
  const tied = (raw) => tokens.some((t) => ` ${norm(raw)} `.includes(` ${t} `));
  const dossier = d.evidenceDossier && typeof d.evidenceDossier === 'object' ? d.evidenceDossier : {};
  const proofs = [];
  const ev = dossier.ratingEvidence && typeof dossier.ratingEvidence === 'object' ? dossier.ratingEvidence : null;
  const dossierRating = num(dossier.rating);
  if (ev && dossierRating != null) {
    const url = str(ev.url);
    const quote = str(ev.quote);
    const average = ev.average == null ? dossierRating : Number(ev.average);
    if (/^https?:/i.test(url) && quote && Number(ev.scaleMax || 5) === 5 && Math.abs(average - dossierRating) < 0.05
      && !unfetched.test(quote) && tied(`${url} ${quote}`)) {
      proofs.push({ rating: dossierRating, count: whole(ev.count), source: sourceOf(ev.source) || sourceOf(url), origin: 'evidenceDossier' });
    }
  }
  for (const page of Array.isArray(dossier.pages) ? dossier.pages : []) {
    const url = str(page && page.url).toLowerCase();
    const body = str(page && page.text);
    const host = /^https?:\/+(?:www\.)?restaurantji\.com\b/.test(url) ? 'Restaurantji'
      : /^https?:\/+(?:www\.)?opentable\.com\b/.test(url) ? 'OpenTable' : '';
    if (!host || !body || !title || unfetched.test(body) || !` ${norm(body)} `.includes(` ${title} `)) continue;
    const line = host === 'Restaurantji'
      ? body.match(/(?:^|[^\d.])([1-5]\.\d)\s+(\d[\d,]*)\s+ratings\b/i)
      : body.match(/(?:^|[^\d.])([1-5]\.\d)\s*(?:\((\d[\d,]*)\)|★\s*·\s*(\d[\d,]*)\s+reviews\b)/i);
    const rating = line ? num(line[1]) : null;
    if (rating != null) proofs.push({ rating, count: whole(line[2] || line[3]), source: host, origin: 'page' });
  }
  const usable = cites.filter((c) => !c.snapshot);
  const named = sourceOf(d.summary);
  const primary = str(d.longDetails || d.description || d.summary);
  const best = usable.find((c) => c.origin === 'summary')
    || (named ? [...usable, ...proofs, ...fields].find((c) => c.source === named) : null)
    || usable.find((c) => c.kind === 1 && c.body === primary)
    || fields[0]
    || proofs[0]
    || usable[0];
  return best ? { rating: Math.min(5, best.rating), count: best.count || null, source: best.source || '', origin: best.origin } : null;
}
