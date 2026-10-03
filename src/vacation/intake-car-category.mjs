function tagEquals(value, expected) {
  return String(value || '').trim().toLowerCase() === expected;
}

export function braveResultHasCarRentalTag(record = {}) {
  return tagEquals(record?.icon_category, 'car_rental');
}

export function osmTagsIndicateCarRental(tags = {}) {
  if (tagEquals(tags.amenity, 'car_rental')) return true;
  return tagEquals(tags.shop, 'car');
}

export function isCarRentalProviderPlace(place = {}) {
  if (osmTagsIndicateCarRental(place.osmTags || {})) return true;
  const record = place.sourceRecord && typeof place.sourceRecord === 'object' ? place.sourceRecord : null;
  if (record && (record.id || record.icon_category !== undefined)) {
    return braveResultHasCarRentalTag(record);
  }
  return false;
}

export function placePersistCategory(place = {}) {
  if (isCarRentalProviderPlace(place)) return 'car';
  return place.category;
}
