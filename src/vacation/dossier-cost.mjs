import { xaiGrokPlaceSearchModelId } from '../../scripts/vacation-app-reply-rules.mjs';

const PLACE_SEARCH_RATE_ROW = { input: 1.25, cached: 0.2, output: 2.5, longInput: 2.5, longCached: 0.4, longOutput: 5 };
const rateByModelKey = new Map();

function normalizeRateKey(model = '') {
  return String(model || '').replace(/-latest$/, '');
}

function defaultRateKey() {
  const fromEnv = normalizeRateKey(process.env.XAI_PLACE_SEARCH_MODEL);
  if (fromEnv) return fromEnv;
  try {
    return normalizeRateKey(xaiGrokPlaceSearchModelId());
  } catch {
    return '';
  }
}

function priceForModel(model) {
  const key = normalizeRateKey(model);
  if (!rateByModelKey.size) {
    const def = defaultRateKey();
    if (def) rateByModelKey.set(def, PLACE_SEARCH_RATE_ROW);
  }
  if (key && !rateByModelKey.has(key)) rateByModelKey.set(key, PLACE_SEARCH_RATE_ROW);
  const def = defaultRateKey();
  return rateByModelKey.get(key) || rateByModelKey.get(def) || PLACE_SEARCH_RATE_ROW;
}

export function xaiCallUsd(model, usage = {}) {
  const price = priceForModel(model);
  const input = Number(usage.input_tokens ?? usage.prompt_tokens) || 0;
  const output = Number(usage.output_tokens ?? usage.completion_tokens) || 0;
  const cached = Number(usage.input_tokens_details?.cached_tokens ?? usage.prompt_tokens_details?.cached_tokens) || 0;
  const long = input >= 200000;
  const usd = ((input - cached) * (long ? price.longInput : price.input)
    + cached * (long ? price.longCached : price.cached)
    + output * (long ? price.longOutput : price.output)) / 1e6;
  return { input, cached, output, usd: Math.round(usd * 1e6) / 1e6 };
}

export function logXaiUsage(dossier, step, model, payload = {}) {
  const row = { step, model, ...xaiCallUsd(model, payload.usage || {}) };
  if (payload.usage?.output_tokens_details?.reasoning_tokens != null) row.reasoning = payload.usage.output_tokens_details.reasoning_tokens;
  dossier.xaiUsage = [...(dossier.xaiUsage || []), row];
  dossier.xaiUsd = Math.round(dossier.xaiUsage.reduce((sum, r) => sum + r.usd, 0) * 1e6) / 1e6;
  return row;
}

const REVIEW_WORDS = /\b(review|reviewed|rated|rating|stars?|recommend|loved?|great|terrible|awful|amazing|delicious|friendly|rude|service|staff|visited|went|ordered|tried|wait|crowded|worth|disappoint\w*|favorite|best|worst)\b/i;
const FACT_WORDS = /\b(open|hours?|closed|daily|mon|tue|wed|thu|fri|sat|sun|am|pm|price|\$\d|menu|signature|specialt\w*|famous|known for|happy hour|founded|since|located|address|reservations?|tickets?|admission|cocktails?|dish|serves?)\b/i;

function sentences(text) {
  return String(text || '').replace(/\s+/g, ' ').match(/[^.!?\n]{1,600}(?:[.!?]+|$)/g) || [];
}

export function condenseText(text, name, { maxChars = 1800, want = 'both' } = {}) {
  const tokens = String(name || '').toLowerCase().replace(/^the\s+/, '').split(/[^a-z0-9]+/).filter((t) => t.length >= 4);
  const parts = sentences(text);
  const scored = parts.map((s, index) => {
    const low = s.toLowerCase();
    let score = 0;
    if (tokens.some((t) => low.includes(t))) score += 2;
    if (want !== 'facts' && REVIEW_WORDS.test(s)) score += 2;
    if (want !== 'reviews' && FACT_WORDS.test(s)) score += 2;
    if (s.trim().length < 25) score -= 2;
    return { s: s.trim(), index, score };
  }).filter((row) => row.score >= 2);
  const keep = [];
  let used = 0;
  for (const row of [...scored].sort((a, b) => b.score - a.score || a.index - b.index)) {
    if (used + row.s.length + 1 > maxChars) continue;
    keep.push(row);
    used += row.s.length + 1;
  }
  return keep.sort((a, b) => a.index - b.index).map((row) => row.s).join(' ');
}

function pageIdsFromReviewSet(dossier = {}) {
  const ids = new Set();
  for (const row of dossier.reviewSet || []) {
    const page = String(row.page || '').trim();
    if (/^p\d+$/.test(page)) ids.add(page);
    for (const token of row.pages || []) if (/^p\d+$/.test(String(token))) ids.add(String(token));
  }
  return ids;
}

export function dossierForReviewWriter(dossier = {}) {
  const keepIds = pageIdsFromReviewSet(dossier);
  const idxById = new Map((dossier.pages || []).map((page, index) => [`p${index + 1}`, page]));
  let left = 10000;
  const pages = [];
  for (const id of [...keepIds].sort()) {
    if (left <= 0) break;
    const page = idxById.get(id);
    if (!page) continue;
    const text = page.via === 'brave' ? String(page.text || '').slice(0, 900)
      : condenseText(page.text, dossier.thing, { maxChars: Math.min(750, left), want: 'reviews' });
    left -= text.length;
    const { braveReviews, braveRating, ...rest } = page;
    pages.push({ id, ...rest, text });
  }
  if (!pages.length) {
    return dossierForModel(dossier, { perPage: 700, total: 10000, want: 'reviews', reviewCap: 80, reviewWords: 55 });
  }
  return {
    thing: dossier.thing,
    pages,
    reviewSet: (dossier.reviewSet || []).slice(0, 80).map((row) => ({
      ...row,
      text: String(row.text || '').split(/\s+/).slice(0, 55).join(' '),
    })),
    reviewsRead: dossier.reviewsRead,
    fieldCounts: dossier.fieldCounts?.reviews ? { reviews: dossier.fieldCounts.reviews } : undefined,
    knownFor: dossier.knownFor,
    rating: dossier.rating,
    reviewsAvailable: dossier.reviewsAvailable,
  };
}

export function beginDossierXaiUsageRun(dossier = {}, persisted = {}) {
  const prior = Array.isArray(persisted.xaiUsage) ? persisted.xaiUsage : [];
  dossier.xaiUsage = [...prior];
  dossier.xaiUsageRunStart = prior.length;
  dossier.xaiUsd = Math.round(prior.reduce((sum, row) => sum + (row.usd || 0), 0) * 1e6) / 1e6;
}

export function commitDossierXaiUsageRun(dossier = {}, persisted = {}, meta = {}) {
  const start = Number.isInteger(dossier.xaiUsageRunStart)
    ? dossier.xaiUsageRunStart
    : (persisted.xaiUsage?.length || 0);
  const steps = (dossier.xaiUsage || []).slice(start);
  const usd = Math.round(steps.reduce((sum, row) => sum + (row.usd || 0), 0) * 1e6) / 1e6;
  const run = { at: new Date().toISOString(), usd, steps, ...meta };
  dossier.xaiUsageRuns = [...(persisted.xaiUsageRuns || []), run];
  delete dossier.xaiUsageRunStart;
  dossier.xaiUsd = Math.round((dossier.xaiUsage || []).reduce((sum, row) => sum + (row.usd || 0), 0) * 1e6) / 1e6;
  return run;
}

export function dossierForModel(dossier = {}, { perPage = 1800, total = 24000, want = 'both', reviewCap = 40, reviewWords = 60 } = {}) {
  let left = total;
  const pages = (dossier.pages || []).map((page) => {
    const text = page.via === 'brave' ? String(page.text || '').slice(0, perPage * 2)
      : condenseText(page.text, dossier.thing, { maxChars: Math.min(perPage, Math.max(0, left)), want });
    left -= text.length;
    const { braveReviews, braveRating, ...rest } = page;
    return { ...rest, text };
  });
  const out = { ...dossier, pages };
  delete out.xaiUsage;
  delete out.attempts;
  if (Array.isArray(dossier.reviewSet)) {
    out.reviewSet = dossier.reviewSet.slice(0, reviewCap).map((r) => ({ ...r, text: String(r.text || '').split(/\s+/).slice(0, reviewWords).join(' ') }));
  }
  return out;
}

export function promptChars(dossier) {
  return (dossier.pages || []).reduce((sum, page) => sum + String(page.text || '').length, 0);
}
