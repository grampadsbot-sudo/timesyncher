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

function hoursLookFetched(value) {
  const row = text(value).toLowerCase();
  if (!row) return false;
  if (/not shown|confirm |before booking|when you pay|hides the supplier|until checkout|until booking/i.test(row)) {
    return false;
  }
  return true;
}

export function isDisplayNameFragment(value, name) {
  const body = text(value).toLowerCase();
  const title = text(name).toLowerCase();
  if (!body || !title) return false;
  if (body === title) return true;
  return title.startsWith(body) && wordCount(body) <= 4;
}

export function opaqueCarNeedsBlank(place, trip) {
  const override = overrideFor(trip, place);
  const source = sourceRecord(place, override);
  const category = text(override.category || place.category_name || place.category?.name).toLowerCase();
  if (category !== 'car') return false;
  const blob = `${place.name || place.title || ''} ${override.rentalCompany || ''} ${source.rentalCompany || ''}`;
  if (!/\bopaque\b/i.test(blob)) return false;
  const pickup = text(override.pickupLocation || source.pickupLocation);
  const dropoff = text(override.returnLocation || source.returnLocation || source.dropoffLocation);
  const pickupHours = text(override.pickupHours || source.pickupHours);
  const dropoffHours = text(override.dropoffHours || source.dropoffHours);
  const price = override.totalPrice ?? override.price ?? source.totalPrice ?? source.price;
  const priceOk = price != null && price !== '' && Number(price) > 0;
  return !(priceOk && pickup && dropoff && hoursLookFetched(pickupHours) && hoursLookFetched(dropoffHours));
}

export function rowSummary(place, trip) {
  const override = overrideFor(trip, place);
  const source = sourceRecord(place, override);
  if (opaqueCarNeedsBlank(place, trip)) return '';
  const fetched = descriptionFromFetchedPlace({
    websiteFlavour: text(override.websiteFlavour || source.websiteFlavour || place.websiteFlavour),
    reviewThemes: override.reviewThemes || source.reviewThemes || place.reviewThemes,
    xaiRatingsFetched: override.xaiRatingsFetched ?? source.xaiRatingsFetched,
    longDetails: text(override.longDetails || source.longDetails),
    details: text(override.details || source.details),
    description: text(source.description || place.description || override.description),
    summary: text(source.summary || override.summary),
  });
  const name = place.name || place.title;
  if (!fetched || isGenericDescription(fetched) || isCannedCategoryTemplate(fetched)) return '';
  if (isDisplayNameFragment(fetched, name)) return '';
  return fetched;
}
