const XAI_RESPONSES_URL = 'https://api.x.ai/v1/responses';
const XAI_MODEL = 'grok-4.3';
const XAI_TIMEOUT_MS = 120000;
const WRITTEN_FROM_SET = 'written from the set';

class XaiPlaceRatingsError extends Error {
  constructor(message, { code, status } = {}) {
    super(message);
    this.name = 'XaiPlaceRatingsError';
    if (code) this.code = code;
    if (status !== undefined) this.status = status;
  }
}

function text(value, max = 4000) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function wordCount(value = '') {
  return text(value, 20000).split(/\s+/).filter(Boolean).length;
}

function publicHttpUrl(value) {
  try {
    const parsed = new URL(text(value, 1000));
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.toString() : '';
  } catch {
    return '';
  }
}

export function xaiApiKey(env = process.env) {
  return String(env.XAI_API_KEY || '').trim();
}

function parseNumericRating(value) {
  const normalized = text(value, 40);
  if (!normalized) return null;
  const direct = Number(normalized);
  if (Number.isFinite(direct) && direct >= 0 && direct <= 5) return direct;
  const match = normalized.match(/([\d.]+)/);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 5 ? parsed : null;
}

function parseReviewCount(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(String(value).replace(/,/g, '').trim());
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.floor(parsed);
}

function normalizeSiteRow(row = {}) {
  const average = parseNumericRating(row.average ?? row.rating ?? row.score);
  const count = parseReviewCount(row.count ?? row.reviewCount ?? row.reviews);
  const sourceUrl = publicHttpUrl(row.sourceUrl ?? row.url);
  if (average == null || count == null) return null;
  return { average, count, sourceUrl };
}

function siteKindFromUrl(url = '') {
  const row = text(url, 500).toLowerCase();
  if (/google\.(com|[a-z]{2,3}\/maps)|maps\.google|g\.co\/maps/.test(row)) return 'google';
  if (/yelp\.(com|[a-z]{2})/.test(row)) return 'yelp';
  if (/tripadvisor\.(com|[a-z.]{2,})/.test(row)) return 'tripadvisor';
  return 'other';
}

function formatCount(count) {
  return Number(count).toLocaleString('en-US');
}

/** Up to three non-Google/Yelp averages for the detail panel "Other ratings" line. */
export function formatOtherRatingsDisplay(rows = []) {
  const cleaned = rows
    .map(normalizeSiteRow)
    .filter(Boolean)
    .slice(0, 3);
  if (!cleaned.length) return { thirdPartyRating: '', thirdPartyReviewCount: '', otherRatings: [] };
  const thirdPartyRating = cleaned.map((row) => String(row.average)).join(' · ');
  const thirdPartyReviewCount = cleaned.map((row) => formatCount(row.count)).join(' · ');
  return {
    thirdPartyRating: text(thirdPartyRating, 120),
    thirdPartyReviewCount: text(thirdPartyReviewCount, 120),
    otherRatings: cleaned.map((row) => ({
      rating: String(row.average),
      count: row.count,
      ...(row.sourceUrl ? { sourceUrl: row.sourceUrl } : {}),
    })),
  };
}

function starSpreadForAverage(average, slots = 4) {
  const target = Math.max(1, Math.min(5, Number(average) || 4));
  const floor = Math.floor(target);
  const ceil = Math.ceil(target);
  const stars = Array(slots).fill(floor);
  let remainder = Math.round((target - floor) * slots);
  for (let index = 0; index < slots && remainder > 0; index += 1) {
    if (stars[index] < ceil) {
      stars[index] += 1;
      remainder -= 1;
    }
  }
  return stars.map((star) => String(Math.max(1, Math.min(5, star))));
}

function expandThemeToReview(theme, flavour, placeName, slotIndex) {
  const topic = text(theme, 400);
  const name = text(placeName, 120);
  const vibe = text(flavour, 220);
  const bits = [
    topic,
    vibe && !topic.toLowerCase().includes(vibe.slice(0, 24).toLowerCase()) ? vibe : '',
    name ? `That matches what visitors say about ${name.split(/\s+/).slice(0, 3).join(' ')}.` : '',
    `Theme ${slotIndex} from the published review set, not one named guest quote.`,
  ].filter(Boolean);
  let body = text(bits.join(' '), 2000);
  while (wordCount(body) < 25) {
    body = text(`${body} The overall rating picture should stay consistent with the published average.`, 2000);
  }
  return body;
}

export function writeRepresentativeReviews({
  themes = [],
  flavour = '',
  placeName = '',
  averageRating = null,
} = {}) {
  const themeRows = (Array.isArray(themes) ? themes : [])
    .map((row) => text(row, 500))
    .filter(Boolean);
  if (!themeRows.length) return {};
  const stars = starSpreadForAverage(averageRating ?? 4.5, 4);
  const fields = {};
  for (let index = 0; index < 4; index += 1) {
    const theme = themeRows[index % themeRows.length];
    const n = index + 1;
    fields[`review${n}`] = expandThemeToReview(theme, flavour, placeName, n);
    fields[`review${n}Source`] = WRITTEN_FROM_SET;
    fields[`review${n}Rating`] = stars[index] || '4';
  }
  return fields;
}

function parseXaiStructuredPayload(raw = {}) {
  const parsed = raw && typeof raw === 'object' ? raw : {};
  const google = normalizeSiteRow(parsed.google);
  const yelp = normalizeSiteRow(parsed.yelp);
  const otherSites = (Array.isArray(parsed.otherSites) ? parsed.otherSites : [])
    .map(normalizeSiteRow)
    .filter(Boolean)
    .filter((row) => siteKindFromUrl(row.sourceUrl) === 'other')
    .slice(0, 3);
  const themes = (Array.isArray(parsed.themes) ? parsed.themes : [])
    .concat(Array.isArray(parsed.praiseThemes) ? parsed.praiseThemes : [])
    .concat(Array.isArray(parsed.complaintThemes) ? parsed.complaintThemes : [])
    .map((row) => text(row, 500))
    .filter(Boolean);
  const flavour = text(parsed.flavour || parsed.websiteFlavour || parsed.officialFlavour, 800);
  return {
    google,
    yelp,
    otherSites,
    themes: [...new Set(themes)].slice(0, 8),
    flavour,
  };
}

function extractOutputText(payload = {}) {
  if (typeof payload.output_text === 'string' && payload.output_text.trim()) {
    return payload.output_text.trim();
  }
  const chunks = [];
  for (const item of payload.output || []) {
    if (typeof item?.content === 'string') chunks.push(item.content);
    for (const part of item?.content || []) {
      if (typeof part?.text === 'string') chunks.push(part.text);
      if (typeof part?.output_text === 'string') chunks.push(part.output_text);
    }
    if (typeof item?.text === 'string') chunks.push(item.text);
  }
  return chunks.join('\n').trim();
}

function parseJsonFromModelText(modelText = '') {
  const body = String(modelText || '').trim();
  if (!body) return null;
  const fenced = body.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : body;
  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    try {
      return JSON.parse(candidate.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

export function parseXaiResponsesPayload(payload = {}) {
  const structured = parseJsonFromModelText(extractOutputText(payload));
  if (!structured) {
    throw new XaiPlaceRatingsError('xAI response did not include parseable JSON', { code: 'XAI_PARSE_FAILED' });
  }
  const parsed = parseXaiStructuredPayload(structured);
  const costUsdTicks = Number(payload?.usage?.cost_in_usd_ticks);
  return {
    ...parsed,
    costUsdTicks: Number.isFinite(costUsdTicks) ? costUsdTicks : null,
  };
}

function buildXaiPrompt({ title, address, website, destination }) {
  const placeLine = [text(title, 200), text(address, 240), text(destination, 160)].filter(Boolean).join(', ');
  const site = text(website, 500);
  return [
    'You are fetching public review aggregates for a travel itinerary place.',
    `Place: ${placeLine}.`,
    site ? `Official website (use for flavour only): ${site}.` : '',
    'Use web_search. Return ONLY JSON with this shape:',
    '{',
    '  "google": {"average": number, "count": integer, "sourceUrl": "https://..."} | null,',
    '  "yelp": {"average": number, "count": integer, "sourceUrl": "https://..."} | null,',
    '  "otherSites": [{"average": number, "count": integer, "sourceUrl": "https://..."}] (max 3, exclude Google and Yelp; do not label TripAdvisor in prose),',
    '  "themes": ["short praise or complaint theme", ...],',
    '  "flavour": "dishes, setting, or vibe from the official site"',
    '}',
    'Rules:',
    '- Never invent a 1-5 star breakdown or star mix.',
    '- If a site does not publish average and count, use null for that site or omit it.',
    '- Counts must be published review totals, not guesses.',
    '- Themes must come from fetched review text.',
  ].filter(Boolean).join('\n');
}

export async function fetchXaiPlaceRatings({
  title = '',
  address = '',
  website = '',
  destination = '',
  env = process.env,
  fetchImpl = globalThis.fetch,
  apiKey,
  timeoutMs = XAI_TIMEOUT_MS,
} = {}) {
  const key = String(apiKey ?? xaiApiKey(env)).trim();
  if (!key) {
    throw new XaiPlaceRatingsError('XAI_API_KEY is not set', { code: 'XAI_API_KEY_MISSING' });
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetchImpl(XAI_RESPONSES_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: XAI_MODEL,
        tools: [{ type: 'web_search' }],
        input: buildXaiPrompt({ title, address, website, destination }),
      }),
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timer);
    throw new XaiPlaceRatingsError(String(error?.message || error), { code: 'XAI_REQUEST_FAILED' });
  }
  clearTimeout(timer);
  const status = Number(response?.status) || 0;
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new XaiPlaceRatingsError(`xAI responses failed: HTTP ${status}`, { code: 'XAI_HTTP_ERROR', status });
  }
  const parsed = parseXaiResponsesPayload(payload);
  if (parsed.costUsdTicks != null) {
    console.info(`xai place ratings cost_usd_ticks=${parsed.costUsdTicks} place="${text(title, 80)}"`);
  }
  return parsed;
}

export function applyXaiPlaceRatingsToRecord(record = {}, xai = {}, { title = '' } = {}) {
  const next = { ...(record || {}) };
  const google = xai.google;
  const yelp = xai.yelp;
  if (google) {
    next.googleRating = String(google.average);
    next.googleReviewCount = String(google.count);
    if (google.sourceUrl) next.googleRatingSourceUrl = google.sourceUrl;
  }
  if (yelp) {
    next.yelpRating = String(yelp.average);
    next.yelpReviewCount = String(yelp.count);
    if (yelp.sourceUrl) next.yelpRatingSourceUrl = yelp.sourceUrl;
  }
  const otherDisplay = formatOtherRatingsDisplay(xai.otherSites || []);
  if (otherDisplay.thirdPartyRating) {
    next.thirdPartyRating = otherDisplay.thirdPartyRating;
    next.thirdPartyReviewCount = otherDisplay.thirdPartyReviewCount;
    next.otherRatings = otherDisplay.otherRatings;
  }
  const primaryCount = google?.count ?? yelp?.count ?? otherDisplay.otherRatings?.[0]?.count ?? null;
  const primaryAverage = google?.average ?? yelp?.average ?? otherDisplay.otherRatings?.[0]?.rating ?? null;
  if (primaryCount != null) next.ratingCount = primaryCount;
  if (primaryAverage != null) next.rating = primaryAverage;
  if (xai.themes?.length) next.reviewThemes = xai.themes;
  if (xai.flavour) next.officialFlavour = xai.flavour;
  delete next.ratingMix;
  if (primaryAverage != null && primaryCount != null && xai.themes?.length) {
    Object.assign(next, writeRepresentativeReviews({
      themes: xai.themes,
      flavour: xai.flavour,
      placeName: title,
      averageRating: primaryAverage,
    }));
  }
  next.xaiRatingsFetched = Boolean(primaryAverage != null && primaryCount != null);
  if (xai.costUsdTicks != null) next.xaiCostUsdTicks = xai.costUsdTicks;
  return next;
}

export function xaiRatingsMissingFields(record = {}) {
  const hasAverage = parseNumericRating(record.googleRating ?? record.yelpRating ?? record.thirdPartyRating ?? record.rating) != null;
  const hasCount = parseReviewCount(record.ratingCount ?? record.googleReviewCount ?? record.yelpReviewCount) != null;
  if (hasAverage && hasCount) return [];
  return ['ratings'];
}
