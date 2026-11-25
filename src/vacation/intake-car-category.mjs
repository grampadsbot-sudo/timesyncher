function tagEquals(value, expected) {
  return String(value || '').trim().toLowerCase() === expected;
}

export function osmTagsIndicateCarRental(tags = {}) {
  if (tagEquals(tags.amenity, 'car_rental')) return true;
  return tagEquals(tags.shop, 'car');
}

export function isCarRentalProviderPlace(place = {}) {
  if (osmTagsIndicateCarRental(place.osmTags || {})) return true;
  const tags = Array.isArray(place.providerCategories) ? place.providerCategories : [];
  if (tags.some((item) => tagEquals(item, 'car_rental'))) return true;
  const record = place.sourceRecord && typeof place.sourceRecord === 'object' ? place.sourceRecord : null;
  if (record && (tagEquals(record.icon_category, 'car_rental') || tagEquals(record.category, 'car'))) {
    return true;
  }
  return false;
}

export function placePersistCategory(place = {}) {
  if (isCarRentalProviderPlace(place)) return 'car';
  return place.category;
}
