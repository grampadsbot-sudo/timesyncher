export function createMergeStoredCcabNarrativeIntoOverride({
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
}) {
  return function mergeStoredCcabNarrativeIntoOverride(place = {}, override = {}) {
    const hit = storedCcabRecordForPlace(place, override);
    if (!hit || !ccabRecordMatchesPlaceCategory(hit, place, override)) return override;
    const existing = listNarrativeCandidateText(place, override);
    if (
      narrativeWordCount(existing) >= 30
      && !isGenericDescription(existing)
      && !isHotelPlanningNote(existing)
      && !isCcabCandidateStubDescription(existing)
      && !isListRowPipelineDiagnostic(existing)
    ) return override;
    const enriched = enrichListRowFromStoredCcab(
      place,
      override,
      override.category || place.category_name,
    );
    if (!enriched) return override;
    const record = enriched.sourceRecord && typeof enriched.sourceRecord === 'object'
      ? enriched.sourceRecord
      : {};
    const next = { ...override };
    const details = text(
      enriched.description ||
        record.longDetails ||
        record.description ||
        record.summary,
    );
    if (details && !isListRowPipelineDiagnostic(details)) {
      next.longDetails = details;
      if (!text(next.details)) next.details = details;
      if (!text(next.description)) next.description = details;
      const placeDesc = text(place.description);
      if ((!placeDesc || narrativeWordCount(placeDesc) < 30) && !isListRowPipelineDiagnostic(placeDesc)) {
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
        for (const key of [
          'thirdPartyRating',
          'thirdPartyReviewCount',
          'thirdPartySource',
          'googleRating',
          'googleReviewCount',
          'yelpRating',
          'yelpReviewCount',
        ]) {
          delete next[key];
        }
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
        && ['googleRating', 'googleReviewCount', 'yelpRating', 'yelpReviewCount', 'thirdPartyRating', 'thirdPartyReviewCount', 'thirdPartySource'].includes(key)
      ) continue;
      if (record[key] != null && record[key] !== '' && (next[key] == null || next[key] === '')) {
        next[key] = record[key];
      }
    }
    if (!incompleteContractRowIds.has(place.id) && next.price == null && enriched.price != null) {
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
      for (const key of [
        'thirdPartyRating',
        'thirdPartyReviewCount',
        'thirdPartySource',
        'googleRating',
        'googleReviewCount',
        'yelpRating',
        'yelpReviewCount',
      ]) {
        delete next[key];
      }
      if (text(next.summary)) place.description = text(next.summary);
      const scrubbed = { ...(next.sourceRecord || {}) };
      delete scrubbed.longDetails;
      delete scrubbed.price;
      scrubbed.description = text(next.summary) || scrubbed.description;
      for (const key of [
        'thirdPartyRating',
        'thirdPartyReviewCount',
        'thirdPartySource',
        'googleRating',
        'googleReviewCount',
        'yelpRating',
        'yelpReviewCount',
      ]) {
        delete scrubbed[key];
      }
      next.sourceRecord = scrubbed;
    }
    return next;
  };
}
