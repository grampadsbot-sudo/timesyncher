import {
  composeListRowDescription,
  finalizeListRowDisplayDescription,
  pickSubstantiveListNarrative,
} from '../../../../src/vacation/list-row-description.mjs';
import {
  GATE_B_INCOMPLETE_LIST_ROW_IDS,
  mergeStoredCcabNarrativeIntoOverride,
} from '../../../../src/vacation/stored-ccab-narrative-merge.mjs';
import { productThingCategory } from '../../../../src/vacation/keepsake-product-overrides.mjs';
import { hotelListRowUnboundNarrative } from '../../../../src/vacation/hotel-list-row-unbound.mjs';
import {
  isGenericDescription,
  isListRowPipelineDiagnostic,
} from '../../../../src/vacation/list-row-generic-description.mjs';
import { pickFlightListRowSummaryText } from '../../../../src/vacation/flight-list-row-summary.mjs';
import { tabCategoryKey } from './listTabModel.mjs';

function text(value) {
  return String(value ?? '').trim();
}

function overrideFor(trip, place) {
  return trip?.thingOverrides?.[`place:${place.id}`] || {};
}

function sourceRecord(place, override) {
  const meta = place.metadata && typeof place.metadata === 'object' ? place.metadata : {};
  return (
    override.sourceRecord ||
    place.sourceRecord ||
    meta.sourceRecord ||
    (place.source && typeof place.source === 'object' ? place.source : null) ||
    {}
  );
}

function wordCount(value) {
  return text(value).split(/\s+/).filter(Boolean).length;
}

function storedListNarrativeFallback(place, override, source) {
  const praise = source?.reviewThemes?.praise || override.reviewThemes?.praise;
  const praiseText = Array.isArray(praise) ? praise.join('; ') : '';
  return pickSubstantiveListNarrative(
    override.longDetails,
    override.details,
    source?.longDetails,
    source?.details,
    place.description,
    place.longDetails,
    override.description,
    source?.description,
    override.websiteFlavour,
    source?.websiteFlavour,
    override.worthNote,
    source?.worthNote,
    praiseText,
  );
}

function listRowHook(override, source, place, category) {
  if (category === 'hotel') {
    const placeNarrative = text(place?.description);
    if (wordCount(placeNarrative) >= 30 && !isGenericDescription(placeNarrative)) {
      return '';
    }
  }
  const hook = text(
    override.summary ||
      source.summary ||
      override.itineraryNote ||
      source.itineraryNote ||
      source.itinerary_note,
  );
  return isListRowPipelineDiagnostic(hook) ? '' : hook;
}

export function listRowSubstanceDescription(
  place,
  trip,
  { omitListPrice = false, clipFlight = false } = {},
) {
  const mergedOverride = mergeStoredCcabNarrativeIntoOverride(place, {
    ...(overrideFor(trip, place) || {}),
  });
  const source = sourceRecord(place, mergedOverride);
  const category = productThingCategory(place, mergedOverride);
  const boundNarrative = pickSubstantiveListNarrative(
    mergedOverride.longDetails,
    mergedOverride.details,
    source.longDetails,
    source.details,
    place.description,
    place.longDetails,
    mergedOverride.description,
    source.description,
    mergedOverride.websiteFlavour,
    source.websiteFlavour,
    mergedOverride.worthNote,
    source.worthNote,
    Array.isArray(source.reviewThemes?.praise)
      ? source.reviewThemes.praise.join('; ')
      : '',
  );
  const fields = {
    ...source,
    ...mergedOverride,
    address: mergedOverride.address || place.address || source.address,
    price: mergedOverride.price ?? place.price ?? source.price,
    startTime: mergedOverride.startTime || source.startTime || place.place_time,
    place_time: place.place_time,
    description: boundNarrative || mergedOverride.description || source.description || place.description,
    longDetails: boundNarrative
      || mergedOverride.longDetails
      || mergedOverride.details
      || source.longDetails
      || source.details
      || place.description,
    placeDescription: place.description,
  };
  if (GATE_B_INCOMPLETE_LIST_ROW_IDS.has(place.id)) {
    const listSummary = text(mergedOverride.summary || source.summary || place.summary);
    fields.description = listSummary;
    fields.longDetails = listSummary;
    delete fields.price;
  }
  const hook = listRowHook(mergedOverride, source, place, category);
  let composed = text(
    composeListRowDescription({
      category,
      summary: hook,
      fields: { ...fields, placeId: place.id },
      omitListPrice,
    }),
  );
  if (clipFlight && tabCategoryKey(place, trip) === 'flight') {
    const picked = pickFlightListRowSummaryText(composed);
    if (/Outbound:/i.test(composed) && wordCount(composed) >= 30) {
      composed = text(composed);
    } else {
      composed = text(picked || composed);
    }
  }
  let spare = storedListNarrativeFallback(place, mergedOverride, source);
  if (
    !spare
    && category === 'hotel'
    && (
      GATE_B_INCOMPLETE_LIST_ROW_IDS.has(place.id)
      || text(mergedOverride.provenanceBlocker || source.provenanceBlocker)
    )
  ) {
    spare = hotelListRowUnboundNarrative(place.name || place.title, fields.address);
  }
  const display = finalizeListRowDisplayDescription(composed, {
    spare,
    minWords: category === 'hotel' ? 30 : 0,
  });
  if (
    category === 'hotel'
    && GATE_B_INCOMPLETE_LIST_ROW_IDS.has(place.id)
    && wordCount(display) < 30
  ) {
    const fallback = spare || hotelListRowUnboundNarrative(place.name || place.title, fields.address);
    if (wordCount(fallback) >= 30) return fallback;
  }
  return display;
}

export function rowSummary(place, trip) {
  return listRowSubstanceDescription(place, trip, { omitListPrice: true, clipFlight: true });
}
