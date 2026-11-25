const NOMINATIM_LODGING_TOURISM = new Set([
  'hotel',
  'apartment',
  'guest_house',
  'chalet',
  'motel',
  'resort',
  'hostel',
]);

const LODGING_PROVIDER_TAGS = new Set([
  'lodging',
  'hotel',
  'resort',
  'inn',
  'motel',
  'hostel',
  'apartment',
  'guest_house',
  'chalet',
]);

function isNominatimLodgingTourismTag(tags = {}) {
  const tourism = String(tags.tourism || '').trim().toLowerCase();
  return NOMINATIM_LODGING_TOURISM.has(tourism);
}

export function placeRecordHasLodgingTag(record = {}) {
  const icon = String(record?.icon_category || '').trim().toLowerCase();
  if (LODGING_PROVIDER_TAGS.has(icon)) return true;
  const cat = String(record?.category || record?.type || '').trim().toLowerCase();
  if (LODGING_PROVIDER_TAGS.has(cat)) return true;
  const categories = Array.isArray(record?.categories) ? record.categories : [];
  if (categories.some((item) => LODGING_PROVIDER_TAGS.has(String(typeof item === 'string' ? item : item?.name || '').trim().toLowerCase()))) {
    return true;
  }
  const providerCats = Array.isArray(record?.providerCategories) ? record.providerCategories : [];
  return providerCats.some((item) => LODGING_PROVIDER_TAGS.has(String(item || '').trim().toLowerCase()));
}

export function isLodgingProviderPlace(place = {}) {
  if (isNominatimLodgingTourismTag(place.osmTags || {})) return true;
  const tags = Array.isArray(place.providerCategories) ? place.providerCategories : [];
  if (tags.some((item) => LODGING_PROVIDER_TAGS.has(String(item || '').trim().toLowerCase()))) return true;
  const record = place.sourceRecord && typeof place.sourceRecord === 'object' ? place.sourceRecord : null;
  if (record && placeRecordHasLodgingTag(record)) return true;
  const source = String(place.source || '').trim().toLowerCase();
  const cat = String(place.category || '').trim().toLowerCase();
  if (source === 'vk-search' && LODGING_PROVIDER_TAGS.has(cat)) return true;
  return false;
}
