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

function sentence(value) {
  const row = text(value);
  if (!row) return '';
  return /[.!?]$/.test(row) ? row : `${row}.`;
}

function fetchedRentalCopy(place, override, source) {
  const category = text(override.category || place.category_name || place.category?.name).toLowerCase();
  if (category !== 'car') return '';
  const carClass = text(override.vehicleClass || override.carType || source.vehicleClass || source.carType);
  const pickup = text(override.pickupLocation || source.pickupLocation);
  const dropoff = text(override.returnLocation || source.returnLocation || source.dropoffLocation);
  const pickupHours = text(override.pickupHours || source.pickupHours);
  const dropoffHours = text(override.dropoffHours || source.dropoffHours);
  const reputation = text(override.reputationNote || source.reputationNote);
  const price = override.totalPrice ?? override.price ?? source.totalPrice ?? source.price;
  const parts = [];
  if (carClass) parts.push(sentence(`Car class: ${carClass}`));
  if (pickup) parts.push(sentence(`Pickup location: ${pickup}`));
  if (dropoff) parts.push(sentence(`Drop-off location: ${dropoff}`));
  if (pickupHours) parts.push(sentence(`Pickup hours: ${pickupHours}`));
  if (dropoffHours) parts.push(sentence(`Drop-off hours: ${dropoffHours}`));
  if (price != null && price !== '' && Number(price) > 0) parts.push(sentence(`Price: $${price}`));
  if (reputation) parts.push(sentence(`Reputation: ${reputation}`));
  if (parts.length < 4) return '';
  return parts.join(' ');
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
  const rental = fetchedRentalCopy(place, override, source);
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
  const fetchedOk = fetched && !isGenericDescription(fetched) && !isCannedCategoryTemplate(fetched) && !isNameFragment(fetched, name)
    ? fetched
    : '';
  if (rental) {
    const body = fetchedOk ? `${rental} ${fetchedOk}` : rental;
    if (isNameFragment(body, name)) return '';
    return body;
  }
  return fetchedOk;
}
