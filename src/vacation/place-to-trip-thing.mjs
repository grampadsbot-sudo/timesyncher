import { placePersistCategory } from './intake-car-category.mjs';
import { detailFieldsFromPlace, mergeThingDetailMetadata } from './thing-detail-fields.mjs';
import { mergeLogoMetadata } from './trip-thing-logo-metadata.mjs';
import { writeRatings } from './write-ratings.mjs';

export function sourceRefFor(place) {
  const source = String(place?.source || '').trim();
  const id = String(place?.externalId || place?.url || '').trim();
  if (!source || !id) return null;
  return { source, id };
}

export function sourceRecordFor(place) {
  const embedded = place?.sourceRecord && typeof place.sourceRecord === 'object' ? place.sourceRecord : null;
  if (embedded && (embedded.id || embedded.icon_category || embedded.categories || embedded.class || embedded.type || embedded.osm_tags)) {
    return {
      ...embedded,
      source: String(place.source || embedded.source || '').trim(),
      url: String(place.url || embedded.url || '').trim(),
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

export function placeToTripThing(place) {
  const sourceRecord = sourceRecordFor(place);
  const sourceRef = sourceRefFor(place);
  const category = placePersistCategory(place);
  const detail = detailFieldsFromPlace(place, { category, title: place.title });
  const enrichedSourceRecord = { ...sourceRecord, ...detail };
  const baseMetadata = mergeThingDetailMetadata({
    source: place.source,
    externalId: place.externalId || '',
    sourceRef,
    sourceRecord: enrichedSourceRecord,
    jevScore: place.jevScore ?? 0,
    ...(place.categoryName ? { categoryName: String(place.categoryName).trim() } : {}),
    ...(Array.isArray(place.providerCategories) && place.providerCategories.length
      ? { providerCategories: place.providerCategories }
      : {}),
  }, {
    ...detail,
    sourceRecord: enrichedSourceRecord,
  });
  return {
    category,
    subtype: place.source,
    title: place.title,
    description: detail.longDetails || place.address || '',
    source: place.source,
    location: {
      lat: place.lat,
      lng: place.lng,
      address: detail.address || place.address || '',
    },
    links: place.url ? [{ label: place.source, url: place.url }] : [],
    ratings: writeRatings({ sourceRecord: enrichedSourceRecord }),
    metadata: mergeLogoMetadata(baseMetadata, { ...place, sourceRecord: enrichedSourceRecord }),
  };
}
