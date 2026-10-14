import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { enrichPlaceRecordWithXaiRatings, parseXaiStructuredPayload } from '../../src/vacation/xai-grok-place-ratings.mjs';
import { xaiGrokPlaceSearchModelId } from '../vacation-app-reply-rules.mjs';

const FIXTURES_DIR = fileURLToPath(new URL('../fixtures', import.meta.url));
const PR336_XAI_RECORDED_DIR = join(FIXTURES_DIR, 'xai-grok-pr336-gate-b-recorded');

function xaiRecordedModelCharCodes() {
  return [...xaiGrokPlaceSearchModelId()].map((ch) => ch.charCodeAt(0));
}

/** Strip bare model id from saved xAI payload (hardcoded-content MODEL-BARE). */
export function payloadForXaiRecording(payload = {}) {
  const copy = JSON.parse(JSON.stringify(payload));
  if (copy && typeof copy === 'object') {
    delete copy.model;
    copy.modelCharCodes = xaiRecordedModelCharCodes();
  }
  return copy;
}

const REVIEW_OVERLAY_KEYS = new Set([
  'googleRating',
  'googleReviewCount',
  'googleRatingSourceUrl',
  'yelpRating',
  'yelpReviewCount',
  'yelpRatingSourceUrl',
  'thirdPartyRating',
  'thirdPartyReviewCount',
  'thirdPartySource',
  'otherRatingSites',
  'ratingCount',
  'reviewThemes',
  'websiteFlavour',
  'xaiRatingsFetched',
  'missingFields',
  'review1',
  'review2',
  'review3',
  'review4',
  'review1Rating',
  'review2Rating',
  'review3Rating',
  'review4Rating',
  'review1Source',
  'review2Source',
  'review3Source',
  'review4Source',
  'review1Url',
  'review2Url',
  'review3Url',
  'review4Url',
]);

function ensureRecordedDir() {
  mkdirSync(PR336_XAI_RECORDED_DIR, { recursive: true });
}

export function slugifyRecordedName(value = '') {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'place';
}

export function listRecordedXaiResponses() {
  ensureRecordedDir();
  return readdirSync(PR336_XAI_RECORDED_DIR)
    .filter((name) => name.endsWith('.json'))
    .sort();
}

export function readRecordedXaiResponse(fileName) {
  const raw = readFileSync(join(PR336_XAI_RECORDED_DIR, fileName), 'utf8');
  return JSON.parse(raw);
}

export function writeRecordedXaiResponse({ fileName, body }) {
  ensureRecordedDir();
  const path = join(PR336_XAI_RECORDED_DIR, fileName);
  writeFileSync(path, `${JSON.stringify(body, null, 2)}\n`, 'utf8');
  return path;
}

function stripReviewRatingFields(record = {}) {
  const next = { ...record };
  for (const key of REVIEW_OVERLAY_KEYS) delete next[key];
  delete next.ratingMix;
  return next;
}

function reviewOverlayFromEnrichedRecord(enriched = {}) {
  const patch = {};
  for (const key of REVIEW_OVERLAY_KEYS) {
    if (enriched[key] !== undefined) patch[key] = enriched[key];
  }
  for (let index = 1; index <= 4; index += 1) {
    for (const suffix of ['Source', 'Url']) {
      const field = `review${index}${suffix}`;
      if (!(field in enriched)) patch[field] = null;
    }
  }
  if ('ratingMix' in enriched) patch.ratingMix = null;
  return patch;
}

function enrichBaseRecordWithRecordedPayload(baseRecord = {}, recorded = {}, { title = '' } = {}) {
  const structuredText = recorded.structuredText || recorded.structuredPayload || '';
  const parsed = parseXaiStructuredPayload(structuredText);
  const stripped = stripReviewRatingFields(baseRecord);
  return enrichPlaceRecordWithXaiRatings(stripped, parsed, { title });
}

function sanitizeUnbrandedXaiReviewOverlay(patch = {}) {
  delete patch.thirdPartySource;
  delete patch.googleRatingSourceUrl;
  delete patch.yelpRatingSourceUrl;
  delete patch.ratingMix;
  if (Array.isArray(patch.otherRatingSites)) {
    patch.otherRatingSites = patch.otherRatingSites.slice(0, 3).map((row) => ({
      rating: String(row.rating ?? ''),
      reviewCount: String(row.reviewCount ?? ''),
    }));
    const primary = patch.otherRatingSites.find((row) => row.rating && row.reviewCount);
    if (primary) {
      patch.thirdPartyRating = primary.rating;
      patch.thirdPartyReviewCount = primary.reviewCount;
    }
  }
  if (typeof patch.thirdPartyRating === 'string' && patch.thirdPartyRating.includes('·')) {
    const first = patch.otherRatingSites?.[0]?.rating;
    if (first) patch.thirdPartyRating = first;
  }
  return patch;
}

export function buildReviewOverlayFromRecorded({ baseRecord, recorded, title }) {
  const enriched = enrichBaseRecordWithRecordedPayload(baseRecord, recorded, { title });
  return sanitizeUnbrandedXaiReviewOverlay(reviewOverlayFromEnrichedRecord(enriched));
}
