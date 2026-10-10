export function sourceRefFor(place) {
  const source = String(place?.source || '').trim();
  const id = String(place?.externalId || place?.url || '').trim();
  if (!source || !id) return null;
  return { source, id };
}

export function sourceRecordFor(place) {
  const embedded = place?.sourceRecord && typeof place.sourceRecord === 'object' ? place.sourceRecord : null;
  if (embedded) {
    return {
      ...embedded,
      source: String(place.source || embedded.source || '').trim(),
      url: String(place.url || embedded.url || embedded.website || '').trim(),
      ...(embedded.rating == null && place.rating != null ? { rating: place.rating } : {}),
      ...(embedded.count == null && embedded.ratingCount == null && place.ratingCount != null
        ? { count: place.ratingCount }
        : {}),
      ...(embedded.categoryName == null && place.categoryName
        ? { categoryName: String(place.categoryName).trim() }
        : {}),
      ...(embedded.providerCategories == null
        && Array.isArray(place.providerCategories)
        && place.providerCategories.length
        ? { providerCategories: place.providerCategories }
        : {}),
    };
  }
  return {
    source: place.source,
    url: place.url || '',
    ...(place.rating != null ? { rating: place.rating } : {}),
    ...(place.ratingCount != null ? { count: place.ratingCount } : {}),
    ...(place.categoryName ? { categoryName: String(place.categoryName).trim() } : {}),
    ...(Array.isArray(place.providerCategories) && place.providerCategories.length
      ? { providerCategories: place.providerCategories }
      : {}),
    ...(place.nominatimClass ? { class: place.nominatimClass } : {}),
    ...(place.nominatimType ? { type: place.nominatimType } : {}),
    ...(place.nominatimTourism ? { tourism: place.nominatimTourism } : {}),
  };
}
