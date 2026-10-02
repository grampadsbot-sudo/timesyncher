function normalizeCategoryLabel(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const LODGING_CATEGORY_PHRASES = [
  'hotel',
  'resort',
  'motel',
  'lodging',
  'accommodation',
  'condominium',
  'condo',
  'vacation rental',
  'guest house',
  'guesthouse',
  'chalet',
  'apartment',
];

const NOMINATIM_LODGING_TOURISM = new Set([
  'hotel',
  'apartment',
  'guest_house',
  'chalet',
  'motel',
]);

function isLodgingCategoryLabel(label) {
  const norm = normalizeCategoryLabel(label);
  if (!norm) return false;
  for (const phrase of LODGING_CATEGORY_PHRASES) {
    if (norm === phrase || norm.includes(phrase)) return true;
  }
  const tokens = norm.split(/\s+/).filter(Boolean);
  return tokens.some((token) => LODGING_CATEGORY_PHRASES.includes(token));
}

function lodgingCategoryTagsFromPlace(place = {}) {
  const tags = [];
  const push = (value) => {
    const text = String(value || '').trim();
    if (text) tags.push(text);
  };
  push(place.category);
  push(place.categoryName);
  const record = place.sourceRecord && typeof place.sourceRecord === 'object' ? place.sourceRecord : {};
  push(record.categoryName);
  const meta = place.metadata && typeof place.metadata === 'object' ? place.metadata : {};
  push(meta.categoryName);
  const providerCategories = Array.isArray(place.providerCategories) ? place.providerCategories : [];
  for (const item of providerCategories) push(item);
  const osmTags = place.osmTags && typeof place.osmTags === 'object' ? place.osmTags : {};
  if (osmTags.tourism) push(`tourism=${osmTags.tourism}`);
  return [...new Set(tags)];
}

function isNominatimLodgingTourismTag(tags = {}) {
  const tourism = String(tags.tourism || '').trim().toLowerCase();
  return NOMINATIM_LODGING_TOURISM.has(tourism);
}

export function isLodgingProviderPlace(place = {}) {
  const category = String(place?.category || '').trim().toLowerCase();
  if (category === 'hotel' || category === 'lodging' || category === 'accommodation') return true;
  if (isNominatimLodgingTourismTag(place.osmTags || {})) return true;
  return lodgingCategoryTagsFromPlace(place).some(isLodgingCategoryLabel);
}
