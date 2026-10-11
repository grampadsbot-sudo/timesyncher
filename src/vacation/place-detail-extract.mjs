import { descriptionPassesDetailJudge, text } from './thing-detail-fields.mjs';

const REVIEW_SOURCES = new Set(['Google', 'Yelp', 'TripAdvisor']);
const HAPPY_HOUR_CATEGORIES = new Set(['restaurant', 'bar']);

export function wordCount(value = '') {
  return text(value, 20000).split(/\s+/).filter(Boolean).length;
}

function publicUrl(value) {
  try {
    const parsed = new URL(text(value, 1000));
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.toString() : '';
  } catch {
    return '';
  }
}

export function reviewSourceFromUrl(url = '') {
  const row = text(url, 500).toLowerCase();
  if (!row) return '';
  if (/google\.(com|[a-z]{2,3}\/maps)|maps\.google|g\.co\/maps/.test(row)) return 'Google';
  if (/yelp\.(com|[a-z]{2})/.test(row)) return 'Yelp';
  if (/tripadvisor\.(com|[a-z.]{2,})/.test(row)) return 'TripAdvisor';
  return '';
}

function reviewSourceFromBlob(blob = '') {
  const row = text(blob, 4000);
  if (/yelp/i.test(row)) return 'Yelp';
  if (/tripadvisor/i.test(row)) return 'TripAdvisor';
  if (/google/i.test(row)) return 'Google';
  return '';
}

function ratingNearText(blob = '', quote = '') {
  const hay = text(blob, 8000);
  const quoteHead = text(quote, 80);
  const idx = quoteHead ? hay.indexOf(quoteHead.slice(0, 40)) : -1;
  const window = idx >= 0 ? hay.slice(Math.max(0, idx - 120), idx + quote.length + 120) : hay;
  const star = window.match(/([0-5](?:\.\d)?)\s*(?:\/\s*5|out of 5|stars?|★)/i);
  if (star) return star[1];
  const plain = window.match(/\b([0-5](?:\.\d)?)\b/);
  return plain ? plain[1] : '';
}

function quoteCandidates(content = '') {
  const blob = String(content || '');
  const quoted = [...blob.matchAll(/[“"]([^”"]{80,900})[”"]/g)].map((match) => text(match[1], 1000));
  const paragraphs = blob
    .split(/\n+/)
    .map((row) => text(row, 1000))
    .filter((row) => wordCount(row) >= 25);
  return [...quoted, ...paragraphs];
}

function uniqueReviews(rows = []) {
  const seen = new Set();
  const out = [];
  for (const row of rows) {
    const key = text(row.text, 200).slice(0, 80).toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(row);
    if (out.length >= 4) break;
  }
  return out;
}

export function extractReviewsFromResults(results = [], title = '') {
  const collected = [];
  for (const result of results) {
    const url = publicUrl(result.url);
    const source = reviewSourceFromUrl(url) || reviewSourceFromBlob(`${result.title || ''} ${result.content || ''}`);
    if (!REVIEW_SOURCES.has(source)) continue;
    for (const quote of quoteCandidates(result.content || '')) {
      if (wordCount(quote) < 25) continue;
      if (title && !new RegExp(`\\b${text(title, 80).split(/\s+/)[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(quote)
        && wordCount(quote) < 40) {
        continue;
      }
      collected.push({
        text: quote,
        source,
        rating: ratingNearText(result.content || '', quote),
        url,
      });
    }
  }
  const reviews = uniqueReviews(collected);
  const fields = {};
  reviews.forEach((review, index) => {
    const n = index + 1;
    fields[`review${n}`] = review.text;
    fields[`review${n}Source`] = review.source;
    if (review.rating) fields[`review${n}Rating`] = review.rating;
  });
  return fields;
}

function collectSummaryUrls(results = [], reviewUrls = new Set()) {
  const urls = [];
  const seen = new Set();
  for (const result of results) {
    const url = publicUrl(result.url);
    if (!url || reviewUrls.has(url) || seen.has(url)) continue;
    seen.add(url);
    urls.push(url);
  }
  return urls;
}

export function buildSummaryFromResults({
  results = [],
  title = '',
  reviews = {},
  website = '',
} = {}) {
  const bits = [];
  for (const result of results) {
    const paragraph = text(result.content || '', 1200);
    if (wordCount(paragraph) < 12) continue;
    bits.push(paragraph);
    if (wordCount(bits.join(' ')) >= 80) break;
  }
  let summary = text(bits.join(' '), 500);
  if (wordCount(summary) < 30) {
    const reviewBits = [1, 2, 3, 4]
      .map((n) => text(reviews[`review${n}`], 400))
      .filter((row) => wordCount(row) >= 25);
    summary = text([summary, ...reviewBits.slice(0, 2)].filter(Boolean).join(' '), 500);
  }
  if (!descriptionPassesDetailJudge(summary, title) && wordCount(summary) >= 30) {
    summary = text(`${title} — ${summary}`, 500);
  }
  const reviewUrls = new Set(
    [1, 2, 3, 4]
      .map((n) => publicUrl(reviews[`review${n}Url`]))
      .filter(Boolean),
  );
  let summarySourceUrls = collectSummaryUrls(results, reviewUrls);
  const site = publicUrl(website);
  if (site && !summarySourceUrls.includes(site)) summarySourceUrls.unshift(site);
  summarySourceUrls = summarySourceUrls.slice(0, 8);
  return { summary, summarySourceUrls };
}

export function extractContactFieldsFromBlob(blob = '') {
  const fields = {};
  const phone = blob.match(/(?:\+1[\s.-]?)?(?:\(\d{3}\)|\d{3})[\s.-]\d{3}[\s.-]\d{4}/);
  if (phone) fields.phone = phone[0];
  const website = blob.match(/https?:\/\/[^\s"'<>]+/i);
  if (website) fields.website = publicUrl(website[0]);
  const hours = blob.match(/(?:hours|open(?:ing)?)[^:\n]{0,24}[:\s-]+([^\n.]{8,160})/i);
  if (hours) fields.hours = text(hours[1], 240);
  const priceLevel = blob.match(/\b(\$\{1,4\}|(?:inexpensive|moderate|expensive|very expensive))\b/i);
  if (priceLevel) fields.priceLevel = text(priceLevel[1], 40);
  const price = blob.match(/\$\s*([\d,]+(?:\.\d{2})?)/);
  if (price) fields.price = price[1].replace(/,/g, '');
  const google = blob.match(/Google[^0-9]*([0-5](?:\.\d)?)\s*(?:\/|\s*out of\s*5)?(?:\s*\(([\d,]+)\s*reviews?\))?/i);
  if (google) {
    fields.googleRating = google[1];
    if (google[2]) fields.googleReviewCount = google[2].replace(/,/g, '');
  }
  const yelp = blob.match(/Yelp[^0-9]*([0-5](?:\.\d)?)(?:\s*\(([\d,]+)\s*reviews?\))?/i);
  if (yelp) {
    fields.yelpRating = yelp[1];
    if (yelp[2]) fields.yelpReviewCount = yelp[2].replace(/,/g, '');
  }
  const trip = blob.match(/TripAdvisor[^0-9]*([0-5](?:\.\d)?)/i);
  if (trip) fields.thirdPartyRating = trip[1];
  return fields;
}

export function extractHappyHourFromBlob(blob = '') {
  const fields = {};
  const days = blob.match(/happy hour[^.\n]{0,30}(?:mon|tue|wed|thu|fri|sat|sun)[^\n.]{0,80}/i);
  const times = blob.match(/happy hour[^.\n]{0,40}(\d{1,2}(?::\d{2})?\s*(?:am|pm)?\s*[-–]\s*\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i);
  const deals = blob.match(/happy hour[^.\n]{0,40}([$][^\n.]{8,160})/i);
  const block = blob.match(/happy hour[^.\n]{0,40}[:\s-]+([^\n.]{12,240})/i);
  if (days) fields.happyHourDays = text(days[0].replace(/happy hour/i, ''), 120);
  if (times) fields.happyHourTimes = text(times[1] || times[0], 80);
  if (deals) fields.happyHourDeals = text(deals[1] || deals[0], 160);
  if (block) {
    fields.happyHourDetails = text(block[0], 1200);
    fields.happyHour = true;
  } else if (fields.happyHourDays || fields.happyHourTimes || fields.happyHourDeals) {
    fields.happyHourDetails = [
      fields.happyHourDays && `Days: ${fields.happyHourDays}`,
      fields.happyHourTimes && `Times: ${fields.happyHourTimes}`,
      fields.happyHourDeals && `Deals: ${fields.happyHourDeals}`,
    ].filter(Boolean).join(' · ');
    fields.happyHour = true;
  }
  return fields;
}

function flightFieldsFromBlob(blob = '', title = '') {
  const fields = {};
  const airline = blob.match(/\b(JetBlue|Southwest|United|Delta|American|Alaska|Spirit|Frontier)\b/i);
  if (airline) fields.airline = airline[1];
  const flightNo = blob.match(/\b([A-Z]{2}\s?\d{2,4})\b/);
  if (flightNo) fields.flightNumber = flightNo[1];
  const times = blob.match(/(\d{1,2}:\d{2}\s*(?:am|pm)?)\s*[→\-–]\s*(\d{1,2}:\d{2}\s*(?:am|pm)?)/i);
  if (times) {
    fields.departureTime = text(times[1], 40);
    fields.arrivalTime = text(times[2], 40);
  }
  const duration = blob.match(/(?:duration|flight time)[^0-9]{0,20}(\d+\s*h(?:\s*\d+\s*m)?|\d+\s*(?:hours?|hr))/i);
  if (duration) fields.duration = text(duration[1], 40);
  const layover = blob.match(/(?:layover|stop)[^.\n]{0,20}([^\n.]{4,120})/i);
  if (layover) fields.layovers = text(layover[1], 120);
  if (!fields.airline && title) fields.airline = text(title.split(/\s+/)[0], 80);
  return fields;
}

function carFieldsFromBlob(blob = '', title = '') {
  const fields = {};
  const company = blob.match(/\b(Hertz|Avis|Enterprise|Budget|Alamo|National|Priceline|Turo)\b/i);
  if (company) fields.rentalCompany = company[1];
  const vehicle = blob.match(/\b(compact|midsize|suv|sedan|corolla|camry|toyota|automatic)[^\n.]{0,40}/i);
  if (vehicle) fields.carType = text(vehicle[0], 80);
  const pickup = blob.match(/(?:pickup|pick up)[^.\n]{0,20}([^\n.]{8,120})/i);
  if (pickup) fields.pickupLocation = text(pickup[1], 120);
  const drop = blob.match(/(?:return|drop off)[^.\n]{0,20}([^\n.]{8,120})/i);
  if (drop) fields.returnLocation = text(drop[1], 120);
  if (!fields.rentalCompany && title) fields.rentalCompany = text(title.split(/\s+/)[0], 80);
  return fields;
}

export function extractDetailFromSearchResults({
  results = [],
  title = '',
  category = 'activity',
  website = '',
} = {}) {
  const cat = text(category, 40).toLowerCase() || 'activity';
  const blob = results.map((row) => `${row.title || ''}\n${row.content || ''}`).join('\n');
  const fields = {
    ...extractContactFieldsFromBlob(blob),
    ...extractReviewsFromResults(results, title),
  };
  if (HAPPY_HOUR_CATEGORIES.has(cat)) {
    Object.assign(fields, extractHappyHourFromBlob(blob));
  }
  if (cat === 'flight') Object.assign(fields, flightFieldsFromBlob(blob, title));
  if (cat === 'car') Object.assign(fields, carFieldsFromBlob(blob, title));
  const paragraphs = results
    .map((row) => text(row.content, 1800))
    .filter((row) => wordCount(row) >= 30);
  if (paragraphs.length) fields.longDetails = text(paragraphs[0], 3000);
  else if (wordCount(blob) >= 30) fields.longDetails = text(blob, 3000);
  const summaryPack = buildSummaryFromResults({
    results,
    title,
    reviews: fields,
    website: website || fields.website,
  });
  fields.summary = summaryPack.summary;
  fields.summarySourceUrls = summaryPack.summarySourceUrls;
  if (fields.website) fields.url = fields.website;
  if (fields.longDetails && title && !fields.itineraryNote) {
    fields.itineraryNote = text(`${title} — ${fields.summary || fields.longDetails}`.split(/\s+/).slice(0, 14).join(' '), 280);
  }
  return fields;
}

export function reviewWordCountOk(fields = {}, index = 1) {
  const body = text(fields[`review${index}`], 2000);
  const source = text(fields[`review${index}Source`], 40);
  if (wordCount(body) < 25) return false;
  return REVIEW_SOURCES.has(source);
}
