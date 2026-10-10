import { placePersistCategory } from './intake-car-category.mjs';
import { writeRatings } from './write-ratings.mjs';
import { mergeLogoMetadata } from './trip-thing-logo-metadata.mjs';
import { enrichSearchPlace } from './trip-thing-enrichment.mjs';
import { sourceRecordFor, sourceRefFor } from './place-search-record.mjs';

export function placeToTripThing(place) {
  const enriched = enrichSearchPlace({ ...place });
  const sourceRecord = sourceRecordFor(enriched);
  const sourceRef = sourceRefFor(enriched);
  const price = enriched.price ?? sourceRecord?.price ?? null;
  const baseMetadata = {
    source: enriched.source,
    externalId: enriched.externalId || '',
    sourceRef,
    sourceRecord,
    jevScore: enriched.jevScore ?? 0,
    ...(price != null ? { price } : {}),
    ...(enriched.categoryName ? { categoryName: String(enriched.categoryName).trim() } : {}),
    ...(Array.isArray(enriched.providerCategories) && enriched.providerCategories.length
      ? { providerCategories: enriched.providerCategories }
      : {}),
  };
  return {
    category: placePersistCategory(enriched),
    subtype: enriched.source,
    title: enriched.title,
    description: enriched.description || enriched.address || '',
    source: enriched.source,
    location: {
      lat: enriched.lat,
      lng: enriched.lng,
      address: enriched.address || '',
    },
    links: enriched.url ? [{ label: enriched.source, url: enriched.url }] : [],
    ratings: writeRatings({ sourceRecord }),
    metadata: mergeLogoMetadata(baseMetadata, { ...enriched, sourceRecord }),
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
  const price = enriched.price ?? sourceRecord?.price ?? null;
  return {
    category: enriched.category,
    subtype: 'tavily',
    title: enriched.title,
    description: enriched.description || '',
    source: 'tavily',
    location: {},
    links: enriched.url ? [{ label: 'tavily', url: enriched.url }] : [],
    ratings: writeRatings({ sourceRecord }),
    metadata: mergeLogoMetadata({
      source: 'tavily',
      externalId: enriched.externalId || enriched.url || '',
      sourceRef,
      sourceRecord,
      jevScore: enriched.jevScore ?? 0,
      ...(price != null ? { price } : {}),
    }, { ...enriched, sourceRecord }),
    ...(price != null ? { price } : {}),
  };
}
