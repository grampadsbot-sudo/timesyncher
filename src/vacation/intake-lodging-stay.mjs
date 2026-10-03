import { normalizeThingType } from './timeline-icons.mjs';

function lodgingLabels(thing = {}) {
  const meta = thing.metadata && typeof thing.metadata === 'object' ? thing.metadata : {};
  const record = thing.sourceRecord && typeof thing.sourceRecord === 'object' ? thing.sourceRecord : {};
  const metaRecord = meta.sourceRecord && typeof meta.sourceRecord === 'object' ? meta.sourceRecord : {};
  return [
    thing.category,
    thing.categoryName,
    meta.categoryName,
    record.icon_category,
    metaRecord.icon_category,
    ...(Array.isArray(thing.providerCategories) ? thing.providerCategories : []),
    ...(Array.isArray(meta.providerCategories) ? meta.providerCategories : []),
    ...(Array.isArray(record.categories) ? record.categories : []),
    ...(Array.isArray(metaRecord.categories) ? metaRecord.categories : []),
  ];
}

export function isLodgingStay(thing = {}) {
  return lodgingLabels(thing).some((value) => normalizeThingType(value) === 'hotel');
}
