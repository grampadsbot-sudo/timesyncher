#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { searchPlaceFromStoredDossier } from '../src/vacation/shared-trip-dossier-overlay.mjs';
import { claimsSupported } from '../src/vacation/thing-dossier-fields.mjs';
import { category, hasEvidenceNote, ratingCount, reviewTexts } from './vk_contract_check_local.mjs';

const REVIEWED = new Set(['hotel', 'restaurant', 'store', 'event']);
const text = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
const nameKey = (value) => text(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const EVIDENCE_FIELDS = [
  'googleRating', 'googleReviewCount', 'googleRatingSourceUrl',
  'yelpRating', 'yelpReviewCount', 'yelpRatingSourceUrl',
  'thirdPartyRating', 'thirdPartyReviewCount', 'thirdPartySource',
  'otherRatingSites', 'rating', 'stars', 'ratingCount', 'ratingMix', 'ratingEvidence',
  'reviews', 'reviewThemes', 'reviewsLabel', 'reviewSources', 'reviewsRead',
  'reviewTotals', 'review_totals', 'ratingsNote', 'reviewsNote', 'ratingReviewEvidence',
];
for (let index = 1; index <= 4; index += 1) {
  for (const suffix of ['', 'Rating', 'Source', 'Url', 'Cites', 'Claims', 'Label', 'Composite', 'CompositeLabel']) EVIDENCE_FIELDS.push(`review${index}${suffix}`);
}

function refreshedPlace(place, dossier, saved = {}) {
  if (!Array.isArray(dossier?.pages) || !dossier.pages.length) throw new Error(`no saved dossier pages for ${place.title}`);
  const seed = structuredClone(place);
  for (const key of EVIDENCE_FIELDS) {
    delete seed[key];
    if (seed.sourceRecord) delete seed.sourceRecord[key];
  }
  const record = searchPlaceFromStoredDossier(seed, dossier);
  const evidence = {};
  const shortcomings = [saved.dataShortcomings, saved.sourceRecord?.dataShortcomings, dossier.dataShortcomings, dossier.shortcomings]
    .flatMap((rows) => Array.isArray(rows) ? rows : [])
    .filter((row) => ['ratings', 'reviews'].includes(row?.field));
  const reviewsRead = saved.reviewsRead ?? saved.sourceRecord?.reviewsRead ?? dossier.reviewsRead;
  const hasReadCount = ['number', 'string'].includes(typeof reviewsRead) && text(reviewsRead) !== '' && Number.isFinite(Number(reviewsRead));
  const note = (field, prefix) => {
    const reasons = [...new Set(shortcomings.filter((row) => row.field === field).map((row) => text(row.reason)).filter(Boolean))];
    return `${prefix}${reasons.length ? `: ${reasons.join('; ')}` : ''}${hasReadCount ? ` (${reviewsRead} reviews read)` : ''}.`;
  };
  for (const key of EVIDENCE_FIELDS) {
    if (record[key] != null && record[key] !== '') evidence[key] = structuredClone(record[key]);
  }
  if (!reviewTexts(evidence).length) {
    const reviews = (dossier.reviews || []).filter((row) => text(row?.text) && claimsSupported(dossier, row));
    if (reviews.length) {
      evidence.reviews = structuredClone(reviews);
      evidence.reviewsLabel = 'Representative reviews written from saved dossier evidence';
      reviews.slice(0, 4).forEach((review, index) => {
        const key = `review${index + 1}`;
        evidence[key] = review.text;
        if (review.rating != null) evidence[`${key}Rating`] = review.rating;
        if (review.url) evidence[`${key}Url`] = review.url;
        evidence[`${key}Claims`] = structuredClone(review.claims);
        evidence[`${key}Label`] = evidence.reviewsLabel;
      });
    }
  }
  if (!ratingCount(evidence)) {
    const site = evidence.otherRatingSites?.find((row) => Number(row.average ?? row.rating) > 0);
    if (site) {
      evidence.thirdPartyRating = String(site.average ?? site.rating);
      if (site.count != null) evidence.thirdPartyReviewCount = String(site.count);
      if (site.name || site.url) evidence.thirdPartySource = site.name || site.url;
    }
  }
  const count = reviewTexts(evidence).length;
  if (count && !text(evidence.reviewsLabel)) evidence.reviewsLabel = 'Representative reviews from saved dossier evidence';
  if (count < 4 && (!hasEvidenceNote(evidence, 'reviews') || shortcomings.some((row) => row.field === 'reviews'))) {
    evidence.reviewsNote = note('reviews', count ? `Limited number of reviews found in saved dossier (${count})` : 'No reviews found in saved dossier');
  }
  if (!ratingCount(evidence) && (!hasEvidenceNote(evidence, 'ratings') || shortcomings.some((row) => row.field === 'ratings'))) evidence.ratingsNote = note('ratings', 'No ratings found in saved dossier');
  if (hasReadCount) evidence.reviewsRead = reviewsRead;
  evidence.ratingReviewEvidence = {
    dossierKey: dossier.key || null,
    thing: dossier.thing || place.title,
    pageUrls: [...new Set(dossier.pages.map((page) => page.url).filter(Boolean))],
  };
  const next = structuredClone(place);
  const src = next.sourceRecord ||= {};
  for (const key of EVIDENCE_FIELDS) {
    delete next[key];
    delete src[key];
  }
  Object.assign(src, evidence);
  for (const row of shortcomings) {
    const rows = src.dataShortcomings ||= [];
    if (!rows.some((existing) => JSON.stringify(existing) === JSON.stringify(row))) rows.push(structuredClone(row));
  }
  return next;
}

export function refreshSnapshotFromSharedTrip(snapshot, shared) {
  if (!Array.isArray(shared?.places) || !shared.thingOverrides) throw new Error('expected shared-trip places and thingOverrides');
  const byId = new Map(shared.places.map((place) => [String(place.id), place]));
  const next = structuredClone(snapshot);
  for (const [id, place] of Object.entries(snapshot)) {
    if (!REVIEWED.has(category(place))) continue;
    const live = byId.get(id);
    if (!live || ![place.title, place.externalId].some((name) => nameKey(name) === nameKey(live.name || live.title))) throw new Error(`shared-trip identity mismatch for row ${id}`);
    const override = shared.thingOverrides[`place:${id}`] || {};
    const record = { ...(live.sourceRecord || {}), ...(override.sourceRecord || {}), ...override };
    const dossier = record.evidenceDossier;
    if (nameKey(dossier?.thing) !== nameKey(live.name || live.title)) throw new Error(`dossier identity mismatch for row ${id}`);
    next[id] = refreshedPlace(place, dossier, record);
  }
  return next;
}

export function refreshSnapshotFromDossiers(snapshot, dossiers) {
  if (!Array.isArray(dossiers)) throw new Error('expected saved dossier array');
  const next = structuredClone(snapshot);
  for (const [id, place] of Object.entries(snapshot)) {
    if (!REVIEWED.has(category(place))) continue;
    const matches = dossiers.filter((dossier) => [place.title, place.externalId].some((name) => nameKey(name) === nameKey(dossier.thing)));
    if (matches.length !== 1) throw new Error(`expected one bound dossier for row ${id}, found ${matches.length}`);
    next[id] = refreshedPlace(place, matches[0]);
  }
  return next;
}

function main() {
  const [mode, evidencePath] = process.argv.slice(2);
  if (!['--shared-trip', '--dossiers'].includes(mode) || !evidencePath || process.argv.length !== 4) throw new Error('usage: node scripts/regenerate_pr336_vk_snapshot_from_fixture_rows.mjs --shared-trip <saved-shared-trip.json> | --dossiers <saved-dossiers.json>');
  const snapshotPath = fileURLToPath(new URL('./fixtures/pr336-vk-search-places.snapshot.json', import.meta.url));
  const snapshot = JSON.parse(readFileSync(snapshotPath, 'utf8'));
  const evidence = JSON.parse(readFileSync(evidencePath, 'utf8'));
  const built = mode === '--shared-trip' ? refreshSnapshotFromSharedTrip(snapshot, evidence) : refreshSnapshotFromDossiers(snapshot, evidence);
  writeFileSync(snapshotPath, `${JSON.stringify(built, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ ok: true, snapshotPath, snapshotKeys: Object.keys(built).length }));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
