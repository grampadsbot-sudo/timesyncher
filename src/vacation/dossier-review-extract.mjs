// Round 4 (chief dr 10/22 2:12 PT): before writing, extract every distinct review/opinion from the dossier pages,
// code first (JSON-LD reviewBody, review-site and Reddit comment markers), model second; every model excerpt must be
// grounded in its cited page by token shingles; then dedupe. The writer gets the full set; the count shown is this count.
import { dossierPageId } from './thing-dossier-fields.mjs';
import { reviewSourceHost } from './thing-evidence-dossier.mjs';

const MAX_WORDS = 80;
const OPINION = /\b(i|we|my|our|us|me|great|good|bad|terrible|amazing|awesome|loved?|recommend|avoid|worst|best|excellent|disappointing|friendly|rude|delicious|overpriced|worth|clean|dirty|noisy)\b/i;
const MARKERS = [
  /\bDate of (?:stay|visit|experience):?\s*\w+\s+\d{4}\b/gi,
  /\b(?:Written|Reviewed|Visited|Stayed)\s+(?:in\s+)?\w+\s+\d{1,2},?\s*\d{4}\b/gi,
  /\b\d(?:\.\d)? of 5 (?:bubbles|stars)\b/gi,
  /\bRated \d(?:\.\d)? out of 5\b/gi,
  /\b[\w-]{3,24}\s?•\s?\d+\s?(?:y|yr|mo|w|d|h)\.?\s?ago\b/gi,
  /\bReviewed (?:on )?\d{1,2}\s\w+\s\d{4}\b/gi,
];

const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const tokens = (s) => norm(s).toLowerCase().replace(/[^a-z0-9' ]+/g, ' ').split(/\s+/).filter(Boolean);
const grams = (s, n = 3) => { const t = tokens(s); const out = new Set(); for (let i = 0; i + n <= t.length; i += 1) out.add(t.slice(i, i + n).join(' ')); return out; };
const clip = (s) => { const w = norm(s).split(' '); return w.length > MAX_WORDS ? `${w.slice(0, MAX_WORDS).join(' ')}…` : norm(s); };

export function reviewGrounded(text, pageText, min = 0.6) {
  const g = grams(text);
  if (!g.size) return false;
  const page = grams(pageText);
  let hit = 0;
  for (const x of g) if (page.has(x)) hit += 1;
  return hit / g.size >= min;
}

function looksLikeReview(text) {
  const n = tokens(text).length;
  return n >= 8 && n <= 400 && OPINION.test(text);
}

export function extractReviewsByCode(dossier = {}) {
  const out = [];
  (dossier.pages || []).forEach((page, index) => {
    const id = dossierPageId(index);
    const text = String(page.text || '');
    if (page.via === 'brave' && Array.isArray(page.braveReviews)) {
      for (const row of page.braveReviews) if (row?.text) out.push({ text: clip(row.text), page: id, method: 'code:brave', ...(row.rating ? { rating: row.rating } : {}) });
    }
    for (const m of text.matchAll(/"reviewBody"\s*:\s*"((?:[^"\\]|\\.)*)"/g)) {
      let body = m[1];
      try { body = JSON.parse(`"${m[1]}"`); } catch { /* keep raw */ }
      if (looksLikeReview(body)) out.push({ text: clip(body), page: id, method: 'code:jsonld' });
    }
    const cuts = [];
    for (const re of MARKERS) for (const m of text.matchAll(re)) cuts.push(m.index, m.index + m[0].length);
    if (cuts.length >= 4) {
      const points = [...new Set(cuts)].sort((a, b) => a - b);
      for (let i = 0; i + 1 < points.length; i += 1) {
        const seg = text.slice(points[i], points[i + 1]);
        if (looksLikeReview(seg) && tokens(seg).length >= 12) out.push({ text: clip(seg), page: id, method: 'code:marker' });
      }
    }
  });
  return out;
}

function pageFor0(dossier, id) {
  const m = /^p(\d+)$/.exec(String(id || ''));
  return m ? dossier.pages?.[Number(m[1]) - 1] : null;
}

export function dedupeReviews(items = []) {
  const kept = [];
  for (const item of items) {
    const g = grams(item.text);
    const dup = kept.some((prev) => {
      const pg = prev._g;
      let inter = 0;
      for (const x of g) if (pg.has(x)) inter += 1;
      return inter / Math.max(1, Math.min(g.size, pg.size)) >= 0.5;
    });
    if (!dup && g.size) kept.push({ ...item, _g: g });
  }
  return kept.map(({ _g, ...rest }) => rest);
}

export function extractionPrompt(dossier = {}, codeItems = []) {
  return [
    'Step 1: "candidates" were cut from the pages by code. Return keep: the ids of candidates that are a genuine customer/guest/critic opinion about THIS place (not another place, not chatter, ads or owner replies).',
    'Step 2: also list in reviews every OTHER distinct opinion about this place in the pages that the candidates missed.',
    'List EVERY distinct customer review, guest comment, forum comment or critic opinion about this place that appears in the saved pages below (ids p1..pN). Do not stop early; there may be dozens.',
    'Copy each one as it appears on the page (you may shorten to its first 60 words). One entry per distinct reviewer. Skip marketing copy, ads, owner replies, and opinions about other places.',
    'Return JSON {"keep":["k1"],"reviews":[{"page":"p3","text":"...","rating":4 or null}]}.',
    JSON.stringify({ thing: dossier.thing, candidates: codeItems.map((c, i) => ({ id: `k${i + 1}`, page: c.page, text: c.text })), pages: (dossier.pages || []).map((p, i) => ({ id: dossierPageId(i), url: p.url, text: p.text })) }),
  ].join('\n');
}

export function finalizeReviewSet(dossier = {}, codeItems = [], modelItems = [], keepIds = null) {
  // Code candidates survive only when the model confirms they are about this place; without a model verdict,
  // only candidates from pages that name the place are kept.
  const core = tokens(String(dossier.thing || '').split(/\s+[-–—|:]\s+/)[0]).filter((w) => w !== 'the').join(' ');
  const keep = Array.isArray(keepIds) ? new Set(keepIds.map(String)) : null;
  codeItems = codeItems.filter((c, i) => c.method === 'code:brave' || (keep ? keep.has(`k${i + 1}`)
    : tokens(pageFor0(dossier, c.page)?.text || '').join(' ').includes(core)));
  const pageFor = (id) => { const m = /^p(\d+)$/.exec(String(id || '')); return m ? dossier.pages?.[Number(m[1]) - 1] : null; };
  const model = (Array.isArray(modelItems) ? modelItems : []).filter((r) => r && typeof r.text === 'string')
    .map((r) => ({ text: clip(r.text), page: String(r.page || ''), rating: Number.isInteger(r.rating) ? r.rating : null, method: 'model' }))
    .filter((r) => { const p = pageFor(r.page); return p && looksLikeReview(r.text) && reviewGrounded(r.text.replace(/…$/, ''), p.text); });
  const set = dedupeReviews([...codeItems, ...model]).map((r, i) => {
    const url = pageFor(r.page)?.url || '';
    return { id: `r${i + 1}`, ...r, pages: [r.page], url, source: reviewSourceHost(url), supported: true };
  });
  return set;
}
