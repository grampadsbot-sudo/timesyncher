import { placePersistCategory } from './intake-car-category.mjs';
import { detailFieldsFromPlace, mergeThingDetailMetadata } from './thing-detail-fields.mjs';
import { writeRatings } from './write-ratings.mjs';
import { mergeLogoMetadata } from './trip-thing-logo-metadata.mjs';
import { enrichSearchPlace } from './trip-thing-enrichment.mjs';
import { sourceRecordFor, sourceRefFor } from './place-search-record.mjs';

export function placeToTripThing(place) {
  const enriched = enrichSearchPlace({ ...place });
  const sourceRecord = sourceRecordFor(enriched);
  const sourceRef = sourceRefFor(enriched);
  const category = placePersistCategory(enriched);
  const detail = detailFieldsFromPlace(enriched, { category, title: enriched.title });
  const enrichedSourceRecord = { ...sourceRecord, ...detail };
  const price = enriched.price ?? detail.price ?? sourceRecord?.price ?? null;
  const baseMetadata = mergeThingDetailMetadata({
    source: enriched.source,
    externalId: enriched.externalId || '',
    sourceRef,
    sourceRecord: enrichedSourceRecord,
    jevScore: enriched.jevScore ?? 0,
    ...(price != null ? { price } : {}),
    ...(enriched.categoryName ? { categoryName: String(enriched.categoryName).trim() } : {}),
    ...(Array.isArray(enriched.providerCategories) && enriched.providerCategories.length
      ? { providerCategories: enriched.providerCategories }
      : {}),
  }, {
    ...detail,
    sourceRecord: enrichedSourceRecord,
  });
  return {
    category,
    subtype: enriched.source,
    title: enriched.title,
    description: detail.longDetails || enriched.description || enriched.address || '',
    source: enriched.source,
    location: {
      lat: enriched.lat,
      lng: enriched.lng,
      address: detail.address || enriched.address || '',
    },
    links: enriched.url ? [{ label: enriched.source, url: enriched.url }] : [],
    ratings: writeRatings({ sourceRecord: enrichedSourceRecord }),
    metadata: mergeLogoMetadata(baseMetadata, { ...enriched, sourceRecord: enrichedSourceRecord }),
    ...(price != null ? { price } : {}),
  };
}

export function noteToTripThing(note) {
  const enriched = enrichSearchPlace({
    ...note,
    source: 'tavily',
    url: note.url || '',
    address: note.address || '',
  });
  const sourceRecord = sourceRecordFor({ ...enriched, source: 'tavily' });
  const sourceRef = sourceRefFor({ ...enriched, source: 'tavily' });
  const category = enriched.category;
  const detail = detailFieldsFromPlace(enriched, { category, title: enriched.title });
  const enrichedSourceRecord = { ...sourceRecord, ...detail };
  const price = enriched.price ?? detail.price ?? sourceRecord?.price ?? null;
  const baseMetadata = mergeThingDetailMetadata({
    source: 'tavily',
    externalId: enriched.externalId || enriched.url || '',
    sourceRef,
    sourceRecord: enrichedSourceRecord,
    jevScore: enriched.jevScore ?? 0,
    ...(price != null ? { price } : {}),
  }, {
    ...detail,
    sourceRecord: enrichedSourceRecord,
  });
  return {
    category,
    subtype: 'tavily',
    title: enriched.title,
    description: detail.longDetails || enriched.description || '',
    source: 'tavily',
    location: {},
    links: enriched.url ? [{ label: 'tavily', url: enriched.url }] : [],
    ratings: writeRatings({ sourceRecord: enrichedSourceRecord }),
    metadata: mergeLogoMetadata(baseMetadata, { ...enriched, sourceRecord: enrichedSourceRecord }),
    ...(price != null ? { price } : {}),
  };
}
