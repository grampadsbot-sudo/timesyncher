import { HAPPY_HOUR_SUBFIELDS } from './dossier-hours-fields.mjs';
import { recordFieldShortcoming } from './thing-evidence-dossier-field-counts.mjs';
import { claimsSupported } from './thing-dossier-fields.mjs';

function pageHashBundle(pageByUrl, url = '') {
  const urls = String(url || '').split(',').map((row) => row.trim()).filter(Boolean);
  return urls.map((row) => pageByUrl.get(row)).filter(Boolean).join('|');
}

const DOSSIER_REBUILD_GROUPS = [
  'summary',
  'description',
  'price',
  'hours',
  'happyHourDetails',
  'rating',
  'reviews',
  'knownFor',
  'itineraryNote',
];

export function computeDossierFieldHashes(dossier = {}) {
  const hashes = {};
  const sources = {};
  const pageByUrl = new Map((dossier.pages || []).map((page) => [page.url, page.sha256]));
  const track = (field, claim) => {
    if (!field || !claim?.url) return;
    const hash = pageHashBundle(pageByUrl, claim.url);
    if (!hash) return;
    hashes[field] = hash;
    sources[field] = claim.url;
  };
  for (const key of ['summary', 'description', 'price', 'hours', 'happyHourDetails', 'itineraryNote', ...HAPPY_HOUR_SUBFIELDS]) {
    track(key, dossier.fields?.[key]);
  }
  track('rating', dossier.ratingEvidence);
  for (const [index, item] of (dossier.knownFor || []).entries()) {
    track(`knownFor:${index}`, item);
  }
  const reviewUrls = [...new Set([...(dossier.reviewExcerpts || []), ...(dossier.reviews || [])]
    .flatMap((row) => String(row.url || '').split(',')).map((row) => row.trim()).filter(Boolean))];
  if (reviewUrls.length && Array.isArray(dossier.reviews) && dossier.reviews.length === 4) {
    const bundle = reviewUrls.map((url) => pageByUrl.get(url)).filter(Boolean).join('|');
    if (bundle) {
      hashes.reviews = bundle;
      sources.reviews = reviewUrls.join(',');
    }
  }
  return { hashes, sources };
}

export function dossierFieldHashesStale(persisted = {}, merged = {}) {
  if (!persisted.fieldHashes || typeof persisted.fieldHashes !== 'object') return true;
  const pageByUrl = new Map((merged.pages || []).map((page) => [page.url, page.sha256]));
  return Object.entries(persisted.fieldHashes).some(([field, hash]) => {
    const url = persisted.fieldSources?.[field];
    if (!url) return true;
    return pageHashBundle(pageByUrl, url) !== hash;
  });
}

export function dossierReviewsEvidenceFresh(persisted = {}, merged = {}) {
  if (!persisted?.fieldHashes?.reviews) return false;
  const url = persisted.fieldSources?.reviews;
  if (!url) return false;
  const pageByUrl = new Map((merged.pages || []).map((page) => [page.url, page.sha256]));
  return pageHashBundle(pageByUrl, url) === persisted.fieldHashes.reviews;
}

export function dossierRebuildFields(persisted = {}, merged = {}, {
  maxAgeExpired = false,
  changedUrls = [],
} = {}) {
  const all = new Set(DOSSIER_REBUILD_GROUPS);
  if (!persisted?.fieldHashes || maxAgeExpired) return all;
  const pageByUrl = new Map((merged.pages || []).map((page) => [page.url, page.sha256]));
  const changed = new Set(changedUrls);
  const stale = new Set();
  for (const [field, hash] of Object.entries(persisted.fieldHashes)) {
    const url = persisted.fieldSources?.[field];
    if (!url || pageHashBundle(pageByUrl, url) !== hash) {
      if (field === 'reviews' || field.startsWith('knownFor:')) stale.add(field.startsWith('knownFor:') ? 'knownFor' : field);
      else if (HAPPY_HOUR_SUBFIELDS.includes(field)) stale.add('happyHourDetails');
      else stale.add(field);
    }
  }
  for (const url of changed) {
    for (const [field, source] of Object.entries(persisted.fieldSources || {})) {
      const sources = String(source || '').split(',').map((row) => row.trim()).filter(Boolean);
      if (sources.includes(url)) {
        if (field === 'reviews') stale.add('reviews');
        else if (field.startsWith('knownFor:')) stale.add('knownFor');
        else if (HAPPY_HOUR_SUBFIELDS.includes(field)) stale.add('happyHourDetails');
        else stale.add(field);
      }
    }
  }
  return stale;
}

export function mergeSelectiveDossierFindings(persisted = {}, built = {}, rebuildFields = new Set(), place = {}) {
  const fields = rebuildFields instanceof Set ? rebuildFields : new Set(rebuildFields);
  if (!persisted || fields.size === 0) return built;
  if (fields.size >= DOSSIER_REBUILD_GROUPS.length) return built;
  const next = JSON.parse(JSON.stringify(persisted));
  next.pages = built.pages;
  next.attempts = built.attempts;
  next.thing = built.thing || next.thing;
  if (fields.has('knownFor')) next.knownFor = built.knownFor;
  if (fields.has('rating')) {
    next.rating = built.rating;
    next.reviewsAvailable = built.reviewsAvailable;
    next.ratingEvidence = built.ratingEvidence;
    next.ratingMix = built.ratingMix;
  }
  if (fields.has('reviews')) {
    const supportedReviews = (dossier) => {
      const reviews = Array.isArray(dossier?.reviews) ? dossier.reviews : [];
      return reviews.filter((row) => claimsSupported({ ...dossier, pages: next.pages }, row));
    };
    const ready = (dossier, supported) => supported.length >= 4
      && supported.length === (Array.isArray(dossier?.reviews) ? dossier.reviews.length : 0);
    const builtSupported = supportedReviews(built);
    const persistedSupported = supportedReviews(persisted);
    const builtOk = ready(built, builtSupported);
    const persistedOk = ready(persisted, persistedSupported);
    if (builtOk) {
      next.reviews = built.reviews;
      next.reviewExcerpts = built.reviewExcerpts;
      next.reviewsRead = built.reviewsRead;
      next.reviewSet = built.reviewSet;
      next.reviewSources = built.reviewSources;
      delete next.reviewsEvidencePageHash;
    } else if (persistedOk) {
      next.reviews = persisted.reviews;
      next.reviewExcerpts = persisted.reviewExcerpts;
      next.reviewsRead = persisted.reviewsRead;
      next.reviewSet = persisted.reviewSet;
      next.reviewSources = persisted.reviewSources;
    } else {
      next.reviews = builtSupported.length ? builtSupported : persistedSupported;
      next.reviewExcerpts = built.reviewExcerpts ?? persisted.reviewExcerpts;
      next.reviewsRead = built.reviewsRead ?? persisted.reviewsRead;
      next.reviewSet = built.reviewSet ?? persisted.reviewSet;
      next.reviewSources = built.reviewSources ?? persisted.reviewSources;
      delete next.reviewsEvidencePageHash;
      const kept = Array.isArray(next.reviews) ? next.reviews : [];
      const droppedUnsupported = (Array.isArray(built.reviews) ? built.reviews.length : 0) > builtSupported.length;
      const limited = (next.shortcomings || []).some((row) => row.field === 'reviews' && /limited number of reviews/i.test(String(row.reason || '')));
      if (droppedUnsupported && kept.length > 0 && kept.length < 4 && !limited) {
        next.shortcomings = recordFieldShortcoming(
          { shortcomings: next.shortcomings || [] },
          'reviews',
          'representative reviews could not be verified from saved evidence',
        );
      }
    }
  }
  next.fields = { ...(next.fields || {}) };
  for (const key of ['summary', 'description', 'price', 'hours', 'happyHourDetails', 'itineraryNote', ...HAPPY_HOUR_SUBFIELDS]) {
    if (!fields.has(key) && !(key.startsWith('happyHour') && fields.has('happyHourDetails'))) continue;
    if (built.fields?.[key]) next.fields[key] = built.fields[key];
    else if (persisted.fields?.[key] && claimsSupported({ ...next, pages: next.pages }, persisted.fields[key])) {
      next.fields[key] = persisted.fields[key];
    } else delete next.fields[key];
  }
  if (fields.has('happyHourDetails')) {
    if (built.fields?.happyHour) next.fields.happyHour = built.fields.happyHour;
    else delete next.fields.happyHour;
  }
  return next;
}
