const NETWORK_SEARCH_PROVIDERS = new Set(['brave', 'osm', 'tavily']);

function text(value, max = 4000) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function hasVerifiedPriceDerivation(record = {}) {
  const status = text(record.priceDerivationStatus || record.storedEstimateDerivationStatus).toLowerCase();
  if (['verified_fare_quote', 'verified_product_quote', 'verified_public_menu_amount'].includes(status)) {
    return true;
  }
  return Boolean(text(record.priceDerivation) || text(record.priceEvidenceUrl));
}

export function ccabSearchProviderCapture(record = {}) {
  const capture = record.searchProviderCapture;
  if (!capture || typeof capture !== 'object') return null;
  const provider = text(capture.provider, 40).toLowerCase();
  if (!NETWORK_SEARCH_PROVIDERS.has(provider)) return null;
  const evidenceRef = text(
    capture.evidenceRef
    || capture.requestId
    || capture.captureSha256
    || capture.responseSha256,
    240,
  );
  if (!evidenceRef) return null;
  return { ...capture, provider, evidenceRef };
}

export function ccabImporterInputKind(record = {}) {
  if (ccabSearchProviderCapture(record)) return 'network_search_capture';
  return 'stored_fixture_literal';
}

export function resolveCcabImporterSearchSource(record = {}) {
  const capture = ccabSearchProviderCapture(record);
  if (capture) return capture.provider;
  return 'prior_db';
}

function ccabPriceProvenanceViolations(ccabRecord = {}, options = {}) {
  const violations = [];
  const price = ccabRecord.price;
  if (price == null || price === '') return violations;
  const blocked = Array.isArray(ccabRecord.provenanceBlocked)
    && ccabRecord.provenanceBlocked.includes('price');
  if (blocked || text(ccabRecord.provenanceBlocker)) return violations;

  const description = text(ccabRecord.description);
  const category = text(ccabRecord.category, 40).toLowerCase();

  if (/planning estimate/i.test(description) && !hasVerifiedPriceDerivation(ccabRecord)) {
    violations.push('unverified_planning_estimate_price');
  }

  if (category === 'flight' && !hasVerifiedPriceDerivation(ccabRecord) && !ccabSearchProviderCapture(ccabRecord)) {
    violations.push('unsupported_flight_fare_quote');
  }

  if (ccabRecord.priceDerivationMismatch === true) {
    violations.push('price_derivation_mismatch');
  }

  if (options.requireIdentity && category === 'hotel' && !text(ccabRecord.website) && !text(ccabRecord.address)) {
    violations.push('missing_hotel_identity');
  }

  return violations;
}

export function ccabSearchPlaceProvenanceViolations({
  ccabKey = '',
  ccabRecord = {},
  place = {},
} = {}) {
  const violations = [];
  const importerKind = ccabImporterInputKind(ccabRecord);
  const resolvedSource = resolveCcabImporterSearchSource(ccabRecord);
  const record = place.sourceRecord && typeof place.sourceRecord === 'object' ? place.sourceRecord : {};

  if (place.source === 'brave' && importerKind === 'stored_fixture_literal') {
    violations.push('false_brave_network_origin');
  }
  if (text(place.source, 40) !== resolvedSource) {
    violations.push('search_source_mismatch');
  }
  if (record.source === 'brave' && importerKind === 'stored_fixture_literal') {
    violations.push('false_brave_source_record');
  }
  if (text(record.ccabInputKind, 80) !== importerKind) {
    violations.push('ccab_input_kind_mismatch');
  }

  const capture = ccabSearchProviderCapture(ccabRecord);
  if (ccabRecord.searchProviderCapture && !capture) {
    violations.push('forged_search_provider_capture');
  }
  if (capture) {
    const embedded = record.searchProviderCapture;
    if (!embedded || text(embedded.provider) !== capture.provider || text(embedded.evidenceRef) !== capture.evidenceRef) {
      violations.push('search_provider_capture_mismatch');
    }
  }

  violations.push(...ccabPriceProvenanceViolations(ccabRecord, { ccabKey }));

  const prov = record.identityProvenance;
  if (prov && typeof prov === 'object') {
    if (text(prov.ccabKey) && text(prov.ccabKey) !== text(ccabKey)) {
      violations.push('identity_provenance_ccab_mismatch');
    }
    if (text(prov.approvedDisplayTitle) && text(prov.approvedDisplayTitle) !== text(place.title)) {
      violations.push('identity_provenance_title_mismatch');
    }
  }

  return violations;
}

export function assertCcabSearchPlaceProvenance(input = {}) {
  const violations = ccabSearchPlaceProvenanceViolations(input);
  if (violations.length) {
    throw new Error(`ccab search place provenance failed (${text(input.ccabKey, 160) || 'unknown'}): ${violations.join(', ')}`);
  }
}
