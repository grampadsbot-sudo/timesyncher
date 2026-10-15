import { descriptionFromFetchedPlace } from '../../../../src/vacation/trip-thing-enrichment.mjs';

function text(value) {
  return String(value ?? '').trim();
}

function overrideFor(trip, place) {
  return trip?.thingOverrides?.[`place:${place.id}`] || {};
}

function sourceRecord(place, override) {
  return (
    override.sourceRecord ||
    place.sourceRecord ||
    (place.source && typeof place.source === 'object' ? place.source : null) ||
    {}
  );
}

export function rowSummary(place, trip) {
  const override = overrideFor(trip, place);
  const source = sourceRecord(place, override);
  return descriptionFromFetchedPlace({
    websiteFlavour: text(override.websiteFlavour || source.websiteFlavour || place.websiteFlavour),
    reviewThemes: override.reviewThemes || source.reviewThemes || place.reviewThemes,
    xaiRatingsFetched: override.xaiRatingsFetched ?? source.xaiRatingsFetched,
  });
}
