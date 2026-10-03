const NOMINATIM_LODGING_TOURISM = new Set([
  'hotel',
  'apartment',
  'guest_house',
  'chalet',
  'motel',
]);

function isNominatimLodgingTourismTag(tags = {}) {
  const tourism = String(tags.tourism || '').trim().toLowerCase();
  return NOMINATIM_LODGING_TOURISM.has(tourism);
}

export function braveResultHasLodgingTag(record = {}) {
  const icon = String(record?.icon_category || '').trim().toLowerCase();
  if (icon === 'lodging') return true;
  const categories = Array.isArray(record?.categories) ? record.categories : [];
  return categories.some((item) => String(item).trim().toLowerCase() === 'lodging');
}

export function isLodgingProviderPlace(place = {}) {
  if (isNominatimLodgingTourismTag(place.osmTags || {})) return true;
  const record = place.sourceRecord && typeof place.sourceRecord === 'object' ? place.sourceRecord : null;
  if (record && (record.id || record.icon_category !== undefined || record.categories)) {
    return braveResultHasLodgingTag(record);
  }
  if (String(place.source || '').trim().toLowerCase() === 'brave') {
    const tags = Array.isArray(place.providerCategories) ? place.providerCategories : [];
    return tags.some((item) => String(item).trim().toLowerCase() === 'lodging');
  }
  return false;
}
