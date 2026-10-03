function tagEquals(value, expected) {
  return String(value || '').trim().toLowerCase() === expected;
}

export function braveResultHasCarRentalTag(record = {}) {
  if (tagEquals(record?.icon_category, 'car_rental')) return true;
  const categories = Array.isArray(record?.categories) ? record.categories : [];
  return categories.some((item) => {
    const text = typeof item === 'string' ? item : String(item?.name || '');
    return tagEquals(text, 'car_rental');
  });
}

export function osmTagsIndicateCarRental(tags = {}) {
  if (tagEquals(tags.amenity, 'car_rental')) return true;
  return tagEquals(tags.shop, 'car');
}

export function isCarRentalProviderPlace(place = {}) {
  if (osmTagsIndicateCarRental(place.osmTags || {})) return true;
  const record = place.sourceRecord && typeof place.sourceRecord === 'object' ? place.sourceRecord : null;
  if (record && (record.id || record.icon_category !== undefined || record.categories)) {
    return braveResultHasCarRentalTag(record);
  }
  if (String(place.source || '').trim().toLowerCase() === 'brave') {
    const tags = Array.isArray(place.providerCategories) ? place.providerCategories : [];
    return tags.some((item) => tagEquals(item, 'car_rental'));
  }
  return false;
}

export function placePersistCategory(place = {}) {
  if (isCarRentalProviderPlace(place)) return 'car';
  return place.category;
}
