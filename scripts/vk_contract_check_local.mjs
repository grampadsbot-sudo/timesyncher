#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { buildNycCraigKimDaybydayTrip } from './fixtures/nyc-craig-kim-daybyday-trip.mjs';
import { GATE_B_INCOMPLETE_CONTRACT_ROW_IDS } from './fixtures/pr336-vk-search-trip-sources.mjs';
import { searchPlaceOutputAcknowledgedViolations } from '../src/vacation/search-place-output.mjs';

const REVIEWED = new Set(['hotel', 'restaurant', 'store', 'event']);
const CATEGORIES = new Set([...REVIEWED, 'flight', 'car']);
const ALIASES = { lodging: 'hotel', accommodation: 'hotel', grocery: 'store', market: 'store', shopping: 'store', shop: 'store', activity: 'event', attraction: 'event', tour: 'event', music: 'event', theatre: 'event' };
const BANNED = /\b(TBD|N\/A|Quote TBD|Add price|lorem|placeholder|sample)\b|^\$0$|^\s*candidate\b|^\s*option\b|Flight option:/i;
const FILLER = ['hotel option worth comparing', 'flight option to compare', 'convenient grocery stop', 'worth comparing because of its JFK counter tradeoff'];
const FLAGGABLE = new Set(['price', 'logoUrl', 'coordinates', 'ratings', 'reviews']);
const text = (value) => String(value || '').replace(/\s+/g, ' ').trim();
const source = (place) => place.sourceRecord && typeof place.sourceRecord === 'object' && !Array.isArray(place.sourceRecord) ? place.sourceRecord : {};
export const category = (place) => ALIASES[text(place.category).toLowerCase()] || text(place.category).toLowerCase();
const num = (value) => value == null || String(value).trim() === '' || Number.isNaN(Number(String(value).replaceAll(',', ''))) ? null : Number(String(value).replaceAll(',', ''));

export function hasEvidenceNote(place, field) {
  const pattern = field === 'reviews'
    ? /\b(?:no reviews (?:were )?(?:found|available)|reviews (?:were )?not found|limited (?:number of )?reviews)\b/i
    : /\b(?:no ratings (?:were )?(?:found|available)|ratings (?:were )?not found)\b/i;
  for (const obj of [place, source(place)]) {
    if (typeof obj[`${field}Note`] === 'string' && pattern.test(obj[`${field}Note`])) return true;
    if (Array.isArray(obj.dataShortcomings) && obj.dataShortcomings.some((row) => row?.field === field && typeof row.reason === 'string' && pattern.test(row.reason))) return true;
  }
  return false;
}

export function ratingCount(place) {
  const src = source(place);
  let count = ['googleRating', 'yelpRating', 'thirdPartyRating', 'rating', 'stars'].filter((key) => num(place[key]) != null || num(src[key]) != null).length;
  const fetchedCount = num(place.ratingCount) || num(src.ratingCount);
  if (fetchedCount > 0 && [place, src].some((obj) => /^\s*\d+(?:\.\d+)?/.test(String(obj.thirdPartyRating || ''))
    || (Array.isArray(obj.otherRatingSites) && obj.otherRatingSites.some((site) => site && typeof site === 'object' && num(site.rating) != null)))) count += 1;
  return count;
}

export function reviewTexts(place) {
  const values = [];
  for (const obj of [place, source(place)]) {
    for (let index = 1; index <= 4; index += 1) values.push(text(obj[`review${index}`]));
    if (Array.isArray(obj.reviews)) values.push(...obj.reviews.map((row) => text(row && typeof row === 'object' ? row.text : row)));
  }
  return [...new Set(values.filter(Boolean))];
}

function flagReason(place) {
  const objects = [place, source(place)];
  if (objects.some((obj) => obj.provenanceBlocker || obj.identityBlocker)) return 'provenance-blocked';
  if (objects.some((obj) => Array.isArray(obj.missingFields) ? obj.missingFields.length : obj.missingFields)) return 'missing-fields';
  if (objects.some((obj) => obj.xaiRatingsFetched === false)) return 'ratings-not-fetched';
  return null;
}

export function checkVkContract(rows) {
  const failing = {};
  const total = {};
  const examples = {};
  const flagged = [];
  const fail = (field, cat, example) => {
    const key = `${field}/${cat}`;
    failing[key] = (failing[key] || 0) + 1;
    (examples[key] ||= []).push(example);
  };
  if (!rows || typeof rows !== 'object' || Array.isArray(rows) || !Object.keys(rows).length) {
    fail('payload', 'empty', 'no rows');
    return { ok: false, rows: 0, total_by_category: total, failing, examples, flagged };
  }
  const descriptions = new Map();
  for (const place of Object.values(rows)) {
    const desc = text(place?.description);
    if (desc) descriptions.set(desc, (descriptions.get(desc) || 0) + 1);
  }
  for (const [id, place] of Object.entries(rows)) {
    if (!place || typeof place !== 'object' || Array.isArray(place)) {
      fail('payload', 'invalid', id);
      continue;
    }
    const cat = category(place);
    const example = `${id} ${text(place.title || place.name).slice(0, 60)}`;
    if (!CATEGORIES.has(cat)) {
      fail('category', 'unknown', `${id} ${text(place.category || place.title || place.name).slice(0, 60)}`);
      continue;
    }
    total[cat] = (total[cat] || 0) + 1;
    const src = source(place);
    const summary = text(place.summary);
    const desc = text(place.description);
    const bad = [];
    const badText = (value) => !value || BANNED.test(value) || FILLER.some((part) => value.toLowerCase().includes(part));
    if (badText(summary) || summary === desc) bad.push('summary');
    if (badText(desc)) bad.push('description');
    if (![place.price, src.price, src.rate, src.amount, src.totalPrice].some((value) => num(String(value ?? '').replaceAll('$', '')) > 0)) bad.push('price');
    if (!text(place.logoUrl || src.logoUrl || src.logo || src.faviconUrl)) bad.push('logoUrl');
    if (place.provenanceBlocker || place.identityBlocker || place.sourceIdentityMismatch
      || (text(place.title || place.name).toLowerCase().includes('midtown sample hotel') && text(place.logoUrl).toLowerCase().includes('manhattanclub'))) bad.push('identity');
    if (REVIEWED.has(cat) && (num(place.lat) == null || num(place.lng) == null)) bad.push('coordinates');
    if (REVIEWED.has(cat) && ratingCount(place) < 1 && !hasEvidenceNote(place, 'ratings')) bad.push('ratings');
    if (REVIEWED.has(cat) && reviewTexts(place).length < 1 && !hasEvidenceNote(place, 'reviews')) bad.push('reviews');
    const reason = flagReason(place);
    if (reason) flagged.push(`${example} (${reason})`);
    for (const field of bad) if (!reason || !FLAGGABLE.has(field)) fail(field, cat, example);
    if (desc && descriptions.get(desc) > 1) fail('description-duplicate', cat, example);
  }
  const known = Object.values(total).reduce((sum, count) => sum + count, 0);
  if (!known) fail('payload', 'no-known-category', 'no known VK categories');
  if (flagged.length > 0.20 * known) fail('flagged', 'over-cap', `${flagged.length} of ${known}`);
  return { ok: !Object.keys(failing).length, rows: known, total_by_category: total, failing, examples, flagged };
}

function formatVkContract(result) {
  const lines = result.flagged.map((row) => `FLAGGED: ${row}`);
  for (const key of Object.keys(result.failing).sort()) {
    lines.push(key === 'flagged/over-cap'
      ? `DATA-CONTRACT: flagged/over-cap ${result.examples[key][0]}`
      : `DATA-CONTRACT: ${key} ${result.failing[key]} failing (e.g. ${result.examples[key].slice(0, 2).join('; ')})`);
  }
  const { examples, ...summary } = result;
  lines.push(JSON.stringify(summary));
  return lines.join('\n');
}

function main() {
  const snapshot = JSON.parse(readFileSync(process.argv[2] || new URL('./fixtures/pr336-vk-search-places.snapshot.json', import.meta.url), 'utf8'));
  if (process.argv[2]) {
    const result = checkVkContract(snapshot);
    console.log(formatVkContract(result));
    process.exitCode = result.ok ? 0 : 1;
    return;
  }
  const trip = buildNycCraigKimDaybydayTrip();
  const failures = [];

  for (const [id, place] of Object.entries(snapshot)) {
    if (GATE_B_INCOMPLETE_CONTRACT_ROW_IDS.has(Number(id))) continue;
    const violations = searchPlaceOutputAcknowledgedViolations(place).filter((code) =>
      !(['missing_rating', 'missing_sourced_reviews'].includes(code)
        && (code === 'missing_rating' ? ratingCount(place) > 0 || hasEvidenceNote(place, 'ratings') : reviewTexts(place).length > 0 || hasEvidenceNote(place, 'reviews'))));
    if (violations.length) failures.push(`DATA-CONTRACT: row ${id} ${violations.join(',')}`);
    const override = trip.thingOverrides[`place:${id}`] || {};
    if (place.price != null && override.price != null && override.price !== place.price) {
      failures.push(`DATA-CONTRACT: row ${id} price mismatch`);
    }
    if (place.logoUrl && override.logoUrl && override.logoUrl !== place.logoUrl) {
      failures.push(`DATA-CONTRACT: row ${id} logo mismatch`);
    }
    if (place.lat != null && override.lat != null && Math.abs(place.lat - override.lat) > 0.0001) {
      failures.push(`DATA-CONTRACT: row ${id} lat mismatch`);
    }
    for (let index = 1; index <= 4; index += 1) {
      const key = `review${index}`;
      const snapBody = place.sourceRecord?.[key];
      if (snapBody && override[key] && override[key] !== snapBody) {
        failures.push(`DATA-CONTRACT: row ${id} ${key} mismatch`);
      }
    }
  }

  const result = checkVkContract(snapshot);
  console.log(formatVkContract(result));
  if (!result.ok) process.exitCode = 1;
  if (failures.length) {
    console.log(failures.join('\n'));
    process.exit(1);
  }
  if (result.ok) console.log('vk_contract_check (local): no DATA-CONTRACT lines');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
