import BASE_ENRICHMENT from '../../scripts/fixtures/nyc_ccab_place_enrichment.json' with { type: 'json' };
import OVERLAY_ENRICHMENT from '../../scripts/fixtures/pr336-gate-b-ccab-overlay.json' with { type: 'json' };
import REVIEW_ENRICHMENT from '../../scripts/fixtures/pr336-gate-b-vk-reviews.json' with { type: 'json' };
import { resolveNycCcabKey } from '../../scripts/fixtures/nyc-vk-list-tab-rows.mjs';

import {
  isGenericDescription,
  isHotelPlanningNote,
  isListRowPipelineDiagnostic,
  isCcabCandidateStubDescription,
} from './list-row-generic-description.mjs';
import { pickSubstantiveListNarrative } from './list-row-description.mjs';
import { storedCcabHotelListNarrative } from './hotel-list-row-unbound.mjs';
import { createMergeStoredCcabNarrativeIntoOverride } from './stored-ccab-merge-into-override.mjs';

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

function rawSearchPlaceFromCcab({
  title,
  category,
  ccabKey,
  ccabRecord = {},
} = {}) {
  const recordCategory = text(ccabRecord.category, 40).toLowerCase();
  const resolvedCategory = category
    || (recordCategory === 'flight' && /\bcar\b|rental|sedan|suv|corolla/i.test(`${title} ${ccabKey}`)
      ? 'car'
      : recordCategory)
    || 'event';
  return {
    source: 'fixture',
    title: text(title, 240),
    category: resolvedCategory,
    lat: ccabRecord.lat ?? null,
    lng: ccabRecord.lng ?? null,
    address: text(ccabRecord.address, 240),
    url: text(ccabRecord.website, 500),
    externalId: text(ccabKey, 240),
    sourceRecord: {
      ...ccabRecord,
      source: 'fixture',
      ccabInputKind: 'stored_fixture_literal',
      url: text(ccabRecord.website, 500),
    },
  };
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

  function websiteHost(url = '') {
    const row = text(url, 500);
    if (!row) return '';
    try {
      const parsed = new URL(row.includes('://') ? row : `https://${row}`);
      return parsed.hostname.toLowerCase().replace(/^www\./, '');
    } catch {
      return '';
    }
  }

  const enrichmentByWebsiteHost = (() => {
    const map = new Map();
    for (const [key, record] of Object.entries(enrichment)) {
      const host = websiteHost(record?.website);
      if (!host || map.has(host)) continue;
      map.set(host, key);
    }
    return map;
  })();

  function websiteUrlsForIdentity(place = {}, override = {}) {
    const capture = place.websiteCapture && typeof place.websiteCapture === 'object'
      ? place.websiteCapture
      : null;
    return [
      place.website,
      override.website,
      override.sourceRecord?.website,
      override.sourceRecord?.url,
      capture?.website,
      place.sourceRecord?.website,
      place.sourceRecord?.url,
    ];
  }

  function enrichmentHitByWebsite(place = {}, override = {}) {
    for (const url of websiteUrlsForIdentity(place, override)) {
      const host = websiteHost(url);
      if (!host) continue;
      const key = enrichmentByWebsiteHost.get(host);
      if (key) return enrichmentHit(key);
    }
    return null;
  }

  const GENERIC_ONE_WORD_PREFIX = new Set([
    'cafe', 'café', 'bar', 'hotel', 'inn', 'shop', 'store', 'restaurant',
    'diner', 'pub', 'grill', 'kitchen', 'bistro', 'market', 'museum',
    'park', 'theater', 'theatre', 'club', 'lounge', 'spa', 'tour',
  ]);

  function enrichmentHitsSharingNamePrefix(name = '') {
    const base = text(resolveNycCcabKey(name) || name, 240);
    if (!base) return [];
    if (!base.includes(' ') && GENERIC_ONE_WORD_PREFIX.has(base.toLowerCase())) return [];
    return Object.keys(enrichment)
      .filter((key) => key === base || key.startsWith(`${base} `))
      .map((key) => enrichmentHit(key))
      .filter(Boolean);
  }

  function substantiveTextFromCcabRecord(record = {}) {
    const praise = record.reviewThemes && typeof record.reviewThemes === 'object' && Array.isArray(record.reviewThemes.praise)
      ? record.reviewThemes.praise.map((row) => text(row, 200)).filter(Boolean).join('; ')
      : '';
    return pickSubstantiveListNarrative(
      record.longDetails,
      record.description,
      record.websiteFlavour,
      record.summary,
      record.itineraryNote,
      praise,
    );
  }

  function bestCcabHitForPlace(hit, place = {}, override = {}) {
    const title = text(place.name || place.title || override.title || hit.ccabKey, 240);
    const candidates = [hit, ...enrichmentHitsSharingNamePrefix(title)];
    let best = hit;
    let bestWords = narrativeWordCount(substantiveTextFromCcabRecord(hit.ccabRecord));
    for (const alt of candidates) {
      if (!alt || alt.ccabKey === best.ccabKey) continue;
      const words = narrativeWordCount(substantiveTextFromCcabRecord(alt.ccabRecord));
      if (words > bestWords) {
        bestWords = words;
        best = alt;
      }
    }
    return best;
  }

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
    for (const candidate of candidates) {
      const hit = enrichmentHit(candidate);
      if (hit) return hit;
    }
    const websiteHit = enrichmentHitByWebsite(place, override);
    if (websiteHit) return websiteHit;
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
    if (isCcabCandidateStubDescription(existing)) return true;
    if (narrativeWordCount(existing) < 30) return true;
    return isGenericDescription(existing);
  }

  function storedCcabRecordForTitle(title = '') {
    return enrichmentHit(title);
  }

  function storedCcabRecordForPlace(place = {}, override = {}) {
    return resolveStoredCcabKey(place, override);
  }

  function enrichListRowFromStoredCcab(place = {}, override = {}, categoryHint = '') {
    const resolvedHit = storedCcabRecordForPlace(place, override);
    if (!resolvedHit) return null;
    const hit = bestCcabHitForPlace(resolvedHit, place, override);
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
    const description = text(
      substantiveTextFromCcabRecord(record) ||
        record.longDetails ||
        record.description ||
        record.summary ||
        hit.ccabRecord.longDetails ||
        hit.ccabRecord.description,
    );
    if (!description) return null;
    return {
      title,
      category: cat || hit.ccabRecord.category,
      description,
      sourceRecord: record,
    };
  }

  function enrichListRowFromStoredCcabTitle(title = '', categoryHint = '') {
    return enrichListRowFromStoredCcab({ name: title }, {}, categoryHint);
  }

  const mergeStoredCcabNarrativeIntoOverride = createMergeStoredCcabNarrativeIntoOverride({
    text,
    narrativeWordCount,
    incompleteContractRowIds,
    storedCcabRecordForPlace,
    ccabRecordMatchesPlaceCategory,
    listNarrativeCandidateText,
    enrichListRowFromStoredCcab,
    storedCcabHotelListNarrative,
    ccabHelpers,
    isGenericDescription,
    isHotelPlanningNote,
    isCcabCandidateStubDescription,
    isListRowPipelineDiagnostic,
  });

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
