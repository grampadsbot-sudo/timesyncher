import BASE_ENRICHMENT from '../../scripts/fixtures/nyc_ccab_place_enrichment.json' with { type: 'json' };
import OVERLAY_ENRICHMENT from '../../scripts/fixtures/pr336-gate-b-ccab-overlay.json' with { type: 'json' };
import REVIEW_ENRICHMENT from '../../scripts/fixtures/pr336-gate-b-vk-reviews.json' with { type: 'json' };
import { resolveNycCcabKey } from '../../scripts/fixtures/nyc-vk-list-tab-rows.mjs';

import {
  isGenericDescription,
  isHotelPlanningNote,
  isListRowPipelineDiagnostic,
} from './list-row-generic-description.mjs';
import { storedCcabHotelListNarrative } from './hotel-list-row-unbound.mjs';
import { isPreCleanupCompleteStoredRow } from './stored-ccab-pre-cleanup-complete-rows.mjs';
import { bestStoredCcabSubstanceDescription, createStoredLongDetails } from './stored-ccab-substance-text.mjs';
import { createStoredCcabWebsiteResolver } from './stored-ccab-website-resolve.mjs';

const PUBLIC_RATING_KEYS = [
  'thirdPartyRating',
  'thirdPartyReviewCount',
  'thirdPartySource',
  'googleRating',
  'googleReviewCount',
  'yelpRating',
  'yelpReviewCount',
];

function mergeCcabEnrichmentLayers(base = {}, ...patches) {
  const merged = { ...base };
  for (const patch of patches) {
    for (const [key, row] of Object.entries(patch || {})) {
      merged[key] = { ...(merged[key] || {}), ...row };
    }
  }
  return merged;
}

function text(value, max = 4000) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

export function createStoredCcabNarrativeMerge(
  enrichment,
  { fixtureRowCcabKeys = {}, incompleteContractRowIds = new Set() } = {},
) {
  function narrativeWordCount(value) {
    return text(value).split(/\s+/).filter(Boolean).length;
  }

  const ccabHelpers = { text, narrativeWordCount, isHotelPlanningNote, isGenericDescription };

  function listNarrativeCandidateText(place = {}, override = {}) {
    const row = text(
      override.longDetails ||
        override.details ||
        override.description ||
        place.description ||
        place.notes,
    );
    return isListRowPipelineDiagnostic(row) ? '' : row;
  }

  function placeCategoryLabel(place = {}, override = {}) {
    return text(
      override.category || place.category_name || place.category?.name || place.category,
      40,
    ).toLowerCase();
  }

  function ccabRecordMatchesPlaceCategory(hit, place = {}, override = {}) {
    if (!hit) return false;
    const ccabKey = text(hit.ccabKey);
    const ccabCat = text(hit.ccabRecord?.category, 40).toLowerCase();
    const placeCat = placeCategoryLabel(place, override);
    if (/^flight option:/i.test(ccabKey) || ccabCat === 'flight') {
      return placeCat.includes('flight');
    }
    if (ccabCat === 'car') {
      return placeCat.includes('car') || placeCat.includes('rental');
    }
    if (ccabCat === 'hotel' || ccabCat.includes('lodging')) {
      return placeCat.includes('hotel') || placeCat.includes('lodging');
    }
    return true;
  }

  function enrichmentHit(ccabKey = '') {
    const key = text(resolveNycCcabKey(ccabKey) || ccabKey, 240);
    if (!key) return null;
    const ccabRecord = enrichment[key];
    if (!ccabRecord || typeof ccabRecord !== 'object') return null;
    return { ccabKey: key, ccabRecord };
  }

  const substanceText = (record) => bestStoredCcabSubstanceDescription(record, ccabHelpers);
  const {
    enrichmentHitByWebsite,
    bestEnrichmentHitByWebsite,
  } = createStoredCcabWebsiteResolver(enrichment, {
    text,
    enrichmentHit,
    ccabRecordMatchesPlaceCategory,
    narrativeWordCount,
    bestStoredCcabSubstanceDescription: substanceText,
  });

  const GENERIC_ONE_WORD_PREFIX = new Set([
    'cafe', 'café', 'bar', 'hotel', 'inn', 'shop', 'store', 'restaurant',
    'diner', 'pub', 'grill', 'kitchen', 'bistro', 'market', 'museum',
    'park', 'theater', 'theatre', 'club', 'lounge', 'spa', 'tour',
  ]);

  function enrichmentHitByUniqueNamePrefix(name = '') {
    const base = text(resolveNycCcabKey(name) || name, 240);
    if (!base) return null;
    if (!base.includes(' ') && GENERIC_ONE_WORD_PREFIX.has(base.toLowerCase())) return null;
    const matches = Object.keys(enrichment).filter(
      (key) => key === base || key.startsWith(`${base} `),
    );
    if (matches.length !== 1) return null;
    return enrichmentHit(matches[0]);
  }

  function placeMetadata(place = {}) {
    return place.metadata && typeof place.metadata === 'object' && !Array.isArray(place.metadata)
      ? place.metadata
      : {};
  }

  function sourceRecordsForIdentity(place = {}, override = {}) {
    const meta = placeMetadata(place);
    const metaRecord = meta.sourceRecord && typeof meta.sourceRecord === 'object' ? meta.sourceRecord : null;
    return {
      overrideRecord: override.sourceRecord && typeof override.sourceRecord === 'object' ? override.sourceRecord : null,
      placeRecord: place.sourceRecord && typeof place.sourceRecord === 'object' ? place.sourceRecord : null,
      metaRecord,
      meta,
    };
  }

  function resolveStoredCcabKey(place = {}, override = {}) {
    const { overrideRecord, placeRecord, metaRecord, meta } = sourceRecordsForIdentity(place, override);
    const candidates = [
      overrideRecord?.identityProvenance?.ccabKey,
      overrideRecord?.ccabKey,
      placeRecord?.identityProvenance?.ccabKey,
      placeRecord?.ccabKey,
      override.externalId,
      place.externalId,
      meta.externalId,
      metaRecord?.identityProvenance?.ccabKey,
      metaRecord?.ccabKey,
      place.name,
      place.title,
      override.title,
    ];
    let resolved = null;
    for (const candidate of candidates) {
      const hit = enrichmentHit(candidate);
      if (hit) {
        resolved = hit;
        break;
      }
    }
    const websiteHit = bestEnrichmentHitByWebsite(place, override);
    if (websiteHit) {
      if (!resolved) return websiteHit;
      const resolvedWords = narrativeWordCount(substanceText(resolved.ccabRecord));
      const websiteWords = narrativeWordCount(substanceText(websiteHit.ccabRecord));
      if (websiteWords > resolvedWords) return websiteHit;
    }
    if (resolved) return resolved;
    const fallbackWebsiteHit = enrichmentHitByWebsite(place, override);
    if (fallbackWebsiteHit) return fallbackWebsiteHit;
    const prefixHit = enrichmentHitByUniqueNamePrefix(place.name || place.title || override.title);
    if (prefixHit) return prefixHit;
    return null;
  }

  function hasStoredCcabIdentity(place = {}, override = {}, hit = null) {
    const resolved = hit || resolveStoredCcabKey(place, override);
    if (!resolved) return false;
    if (fixtureRowCcabKeys[place.id]) return true;
    if (enrichmentHitByWebsite(place, override)) return true;
    const { overrideRecord, placeRecord, metaRecord, meta } = sourceRecordsForIdentity(place, override);
    const identityKeys = [
      overrideRecord?.identityProvenance?.ccabKey,
      overrideRecord?.ccabKey,
      placeRecord?.identityProvenance?.ccabKey,
      placeRecord?.ccabKey,
      override.externalId,
      place.externalId,
      meta.externalId,
      metaRecord?.identityProvenance?.ccabKey,
      metaRecord?.ccabKey,
    ].map((row) => text(row, 240)).filter(Boolean);
    if (identityKeys.some((key) => key === resolved.ccabKey)) return true;
    const displayName = text(place.name || place.title || override.title);
    if (displayName && displayName !== resolved.ccabKey) return true;
    const prefixHit = enrichmentHitByUniqueNamePrefix(displayName);
    return Boolean(
      prefixHit
      && prefixHit.ccabKey === resolved.ccabKey
      && displayName !== resolved.ccabKey,
    );
  }

  function storedCcabNarrativeNeedsMerge(place = {}, override = {}) {
    const hit = resolveStoredCcabKey(place, override);
    if (!hit || !ccabRecordMatchesPlaceCategory(hit, place, override)) return false;
    const existing = listNarrativeCandidateText(place, override);
    if (!existing) return hasStoredCcabIdentity(place, override, hit);
    if (isHotelPlanningNote(existing)) return true;
    if (narrativeWordCount(existing) < 30) return true;
    return isGenericDescription(existing);
  }

  function storedCcabRecordForTitle(title = '') {
    return enrichmentHit(title);
  }

  function storedCcabRecordForPlace(place = {}, override = {}) {
    return resolveStoredCcabKey(place, override);
  }

  const storedLongDetails = createStoredLongDetails(enrichment, ccabHelpers);

  function enrichListRowFromStoredCcab(
    place = {},
    override = {},
    categoryHint = '',
    { needsSubstanceBoost = false } = {},
  ) {
    const hit = storedCcabRecordForPlace(place, override);
    if (!hit) return null;
    const cat = text(categoryHint || override.category || place.category_name, 40).toLowerCase();
    const title = text(place.name || place.title || hit.ccabKey, 240);
    const record = { ...hit.ccabRecord };
    const hotelNarrative = (cat === 'hotel' || cat.includes('lodging'))
      ? storedCcabHotelListNarrative(title, record, ccabHelpers)
      : null;
    if (hotelNarrative?.summary) record.summary = hotelNarrative.summary;
    if (hotelNarrative?.longDetails) {
      record.longDetails = hotelNarrative.longDetails;
      record.description = hotelNarrative.longDetails;
    }
    if (hotelNarrative?.neighborhood) record.neighborhood = hotelNarrative.neighborhood;
    if (hotelNarrative?.websiteFlavour) record.websiteFlavour = hotelNarrative.websiteFlavour;
    const primary = text(
      record.longDetails
      || record.description
      || record.summary
      || hit.ccabRecord.longDetails
      || hit.ccabRecord.description,
    );
    const description = text(
      hotelNarrative?.longDetails
      || (needsSubstanceBoost ? substanceText(record) : null)
      || primary,
    );
    if (!description) return null;
    if (!needsSubstanceBoost && narrativeWordCount(description) >= 25) {
      record.longDetails = description;
      record.description = description;
    }
    const ccabPrice = record.price ?? hit.ccabRecord.price;
    return {
      title,
      category: cat || hit.ccabRecord.category,
      description,
      price: ccabPrice != null && ccabPrice !== '' ? ccabPrice : null,
      logoUrl: text(record.logoUrl || hit.ccabRecord.logoUrl, 500) || null,
      sourceRecord: record,
    };
  }

  function enrichListRowFromStoredCcabTitle(title = '', categoryHint = '') {
    return enrichListRowFromStoredCcab({ name: title }, {}, categoryHint);
  }

  function mergeStoredCcabNarrativeIntoOverride(place = {}, override = {}) {
    const hit = storedCcabRecordForPlace(place, override);
    if (!hit || !ccabRecordMatchesPlaceCategory(hit, place, override)) return override;
    const existing = listNarrativeCandidateText(place, override);
    if (existing && isPreCleanupCompleteStoredRow(place)) return override;
    if (
      narrativeWordCount(existing) >= 30
      && !isGenericDescription(existing)
      && !isHotelPlanningNote(existing)
      && !isListRowPipelineDiagnostic(existing)
    ) {
      const servedDescription = text(
        override.description ||
          override.longDetails ||
          override.details,
      );
      const mergedByCcab = text(override.sourceRecord?.ccabKey) === hit.ccabKey
        && servedDescription === enrichListRowFromStoredCcab(place, override, override.category || place.category_name)?.description;
      if (!text(place.description) && servedDescription && mergedByCcab) place.description = servedDescription;
      return override;
    }
    const ccabPrimary = text(
      hit.ccabRecord.longDetails ||
        hit.ccabRecord.description ||
        hit.ccabRecord.summary,
    );
    const needsSubstanceBoost = (
      !existing
      || isGenericDescription(existing)
      || isHotelPlanningNote(existing)
      || (narrativeWordCount(existing) < 25 && text(existing) === ccabPrimary)
    ) && narrativeWordCount(ccabPrimary) < 25;
    const enriched = enrichListRowFromStoredCcab(
      place,
      override,
      override.category || place.category_name,
      { needsSubstanceBoost },
    );
    if (!enriched) return override;
    const record = enriched.sourceRecord && typeof enriched.sourceRecord === 'object'
      ? enriched.sourceRecord
      : {};
    const next = { ...override };
    const rowCat = text(override.category || place.category_name || record.category, 40).toLowerCase();
    const details = text(
      enriched.description ||
        record.longDetails ||
        record.description ||
        record.summary,
    );
    if (details && !isListRowPipelineDiagnostic(details)) {
      const longDetails = storedLongDetails(hit, details, rowCat);
      next.longDetails = longDetails;
      if (!text(next.details)) next.details = longDetails;
      const keepSnapshotDescription = needsSubstanceBoost
        && narrativeWordCount(details) > narrativeWordCount(ccabPrimary)
        && text(ccabPrimary);
      if (keepSnapshotDescription) {
        next.description = ccabPrimary;
      } else if (!text(next.description)) {
        next.description = details;
      }
      const placeDesc = text(place.description);
      if (keepSnapshotDescription) {
        if (!placeDesc || placeDesc === ccabPrimary) place.description = ccabPrimary;
      } else if ((!placeDesc || narrativeWordCount(placeDesc) < 30) && !isListRowPipelineDiagnostic(placeDesc)) {
        place.description = details;
      }
    }
    if (hit.ccabKey && !text(next.externalId)) next.externalId = hit.ccabKey;
    if (hit.ccabKey) {
      const prior = next.sourceRecord && typeof next.sourceRecord === 'object' ? next.sourceRecord : {};
      next.sourceRecord = { ...prior, ccabKey: hit.ccabKey };
      if (!text(place.externalId)) place.externalId = hit.ccabKey;
    }
    const hotelCategory = text(override.category || place.category_name || record.category, 40).toLowerCase();
    const hotelNarrative = (hotelCategory === 'hotel' || hotelCategory.includes('lodging'))
      && !text(record.websiteFlavour)
      && isHotelPlanningNote(record.description || record.summary)
      ? storedCcabHotelListNarrative(
        place.name || place.title || hit.ccabKey,
        record,
        ccabHelpers,
      )
      : null;
    if (hotelNarrative) {
      if (hotelNarrative.summary) next.summary = hotelNarrative.summary;
      if (hotelNarrative.longDetails) {
        next.longDetails = hotelNarrative.longDetails;
        if (!text(next.details)) next.details = hotelNarrative.longDetails;
        const planningNote = isHotelPlanningNote(text(record.description))
          ? text(record.description)
          : '';
        if (planningNote) {
          next.description = planningNote;
          if (!incompleteContractRowIds.has(place.id)) {
            place.description = planningNote;
          }
        } else {
          if (!text(next.description)) next.description = hotelNarrative.longDetails;
          place.description = hotelNarrative.longDetails;
        }
      }
      if (hotelNarrative.neighborhood) next.neighborhood = hotelNarrative.neighborhood;
      if (hotelNarrative.websiteFlavour) next.websiteFlavour = hotelNarrative.websiteFlavour;
      if (incompleteContractRowIds.has(place.id)) {
        delete next.longDetails;
        delete next.details;
        delete next.price;
        for (const key of PUBLIC_RATING_KEYS) delete next[key];
      }
    }
    for (const key of [
      'summary',
      'itineraryNote',
      'websiteFlavour',
      'address',
      'neighborhood',
      'googleRating',
      'googleReviewCount',
      'yelpRating',
      'yelpReviewCount',
      'thirdPartyRating',
      'thirdPartyReviewCount',
      'thirdPartySource',
      'reviewThemes',
      'website',
    ]) {
      if (hotelNarrative && key === 'summary') continue;
      if (
        incompleteContractRowIds.has(place.id)
        && PUBLIC_RATING_KEYS.includes(key)
      ) continue;
      if (record[key] != null && record[key] !== '' && (next[key] == null || next[key] === '')) {
        next[key] = record[key];
      }
    }
    if (
      !incompleteContractRowIds.has(place.id)
      && (next.price == null || next.price === '')
      && enriched.price != null
      && enriched.price !== ''
    ) {
      next.price = enriched.price;
    }
    if (!next.logoUrl && enriched.logoUrl) next.logoUrl = enriched.logoUrl;
    if (!next.sourceRecord || typeof next.sourceRecord !== 'object') {
      next.sourceRecord = { ...record };
    } else {
      next.sourceRecord = { ...record, ...next.sourceRecord };
    }
    if (incompleteContractRowIds.has(place.id)) {
      delete next.longDetails;
      delete next.details;
      delete next.price;
      for (const key of PUBLIC_RATING_KEYS) delete next[key];
      if (text(next.summary)) place.description = text(next.summary);
      const scrubbed = { ...(next.sourceRecord || {}) };
      delete scrubbed.longDetails;
      delete scrubbed.price;
      scrubbed.description = text(next.summary) || scrubbed.description;
      for (const key of PUBLIC_RATING_KEYS) delete scrubbed[key];
      next.sourceRecord = scrubbed;
    }
    return next;
  }

  function shouldMergeStoredCcabOnFixtureReplay(place = {}, override = {}) {
    if (fixtureRowCcabKeys[place.id]) return true;
    if (enrichmentHitByWebsite(place, override)) return true;
    const hit = resolveStoredCcabKey(place, override);
    if (!hit || !ccabRecordMatchesPlaceCategory(hit, place, override)) return false;
    if (storedCcabNarrativeNeedsMerge(place, override)) return true;
    const displayName = text(place.name || place.title || override.title);
    if (displayName && displayName !== hit.ccabKey) return true;
    if (override.timeline === true) {
      const cat = placeCategoryLabel(place, override);
      if (!cat.includes('hotel') && !cat.includes('lodging')) return true;
    }
    return false;
  }

  return {
    enrichListRowFromStoredCcab,
    enrichListRowFromStoredCcabTitle,
    mergeStoredCcabNarrativeIntoOverride,
    resolveStoredCcabKey,
    shouldMergeStoredCcabOnFixtureReplay,
    storedCcabRecordForPlace,
    storedCcabRecordForTitle,
  };
}

const LIVE_ENRICHMENT = mergeCcabEnrichmentLayers(
  BASE_ENRICHMENT,
  OVERLAY_ENRICHMENT,
  REVIEW_ENRICHMENT,
);

export const GATE_B_INCOMPLETE_LIST_ROW_IDS = new Set([608]);

const liveStoredCcabNarrative = createStoredCcabNarrativeMerge(LIVE_ENRICHMENT, {
  incompleteContractRowIds: GATE_B_INCOMPLETE_LIST_ROW_IDS,
});

export const mergeStoredCcabNarrativeIntoOverride = liveStoredCcabNarrative.mergeStoredCcabNarrativeIntoOverride;
