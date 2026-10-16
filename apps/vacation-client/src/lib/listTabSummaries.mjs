import {
  descriptionFromFetchedPlace,
  isCannedCategoryTemplate,
  isGenericDescription,
} from '../../../../src/vacation/trip-thing-enrichment.mjs';

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

function wordCount(value) {
  return text(value).split(/\s+/).filter(Boolean).length;
}

function isNameFragment(description, name) {
  const body = text(description).toLowerCase();
  const title = text(name).toLowerCase();
  if (!body || !title) return false;
  if (body === title) return true;
  return title.startsWith(body) && wordCount(body) <= 4;
}

export function rowSummary(place, trip) {
  const override = overrideFor(trip, place);
  const source = sourceRecord(place, override);
  const fetched = descriptionFromFetchedPlace({
    websiteFlavour: text(override.websiteFlavour || source.websiteFlavour || place.websiteFlavour),
    reviewThemes: override.reviewThemes || source.reviewThemes || place.reviewThemes,
    xaiRatingsFetched: override.xaiRatingsFetched ?? source.xaiRatingsFetched,
    longDetails: text(override.longDetails || source.longDetails),
    details: text(override.details || source.details),
    description: text(source.description || place.description || override.description),
    summary: text(source.summary || override.summary),
  });
  if (!fetched || isGenericDescription(fetched) || isCannedCategoryTemplate(fetched)) return '';
  if (isNameFragment(fetched, place.name || place.title)) return '';
  return fetched;
}
