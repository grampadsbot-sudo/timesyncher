import { isLodgingStay } from './intake-lodging-stay.mjs';
import { transportKind } from './intake-transport-kind.mjs';
import { normalizeThingType } from './timeline-icons.mjs';

function labelText(value) {
  if (typeof value === 'string') return value.trim();
  if (value && typeof value === 'object' && !Array.isArray(value)) return String(value.name || '').trim();
  return '';
}

function sourceCategoryName(thing = {}) {
  const meta = thing.metadata && typeof thing.metadata === 'object' ? thing.metadata : {};
  const record = thing.sourceRecord && typeof thing.sourceRecord === 'object' ? thing.sourceRecord : {};
  const metaRecord = meta.sourceRecord && typeof meta.sourceRecord === 'object' ? meta.sourceRecord : {};
  for (const value of [
    thing.categoryName,
    meta.categoryName,
    record.categoryName,
    metaRecord.categoryName,
    record.category_name,
    metaRecord.category_name,
  ]) {
    const text = labelText(value);
    if (text) return text;
  }
  return labelText(thing.category);
}

const PINNED_CATEGORY = {
  restaurant: ['Restaurant', '🍽️', 'restaurant'],
  bar: ['Bar', '☕', 'bar'],
  store: ['Store', '🛍️', 'store'],
  tour: ['tour', '🎟️', 'tour'],
  attraction: ['attraction', '🏛️', 'attraction'],
  event: ['event', '🎟️', 'event'],
  sightseeing: ['sightseeing', '🎟️', 'sightseeing'],
};

/** Map intake thing rows to shared-trip category labels (attraction/tour before flight heuristics). */
export function categoryFor(thing) {
  const lodging = isLodgingStay(thing);
  const rawCategory = String(thing.category || '').trim().toLowerCase();
  const pinned = PINNED_CATEGORY[rawCategory];
  if (pinned) {
    return { category_name: pinned[0], category_icon: pinned[1], category: pinned[2] };
  }
  const inferTransport = rawCategory !== 'activity';
  const kind = inferTransport ? transportKind(thing) : null;
  if (inferTransport && (kind === 'flight' || (kind === 'car' && !lodging))) {
    const category_name = kind === 'flight' ? 'Flight' : 'Car';
    const category_icon = kind === 'flight' ? '✈️' : '🚗';
    return { category_name, category_icon, category: kind };
  }
  const source = thing?.source && typeof thing.source === 'object' ? thing.source : {};
  const model = thing?.model && typeof thing.model === 'object' ? thing.model : {};
  const raw = String(
    source.category || source.category_name || thing?.sourceCategory || ''
    || model.category || model.category_name || thing?.modelCategory || ''
    || sourceCategoryName(thing)
  ).trim();
  if (!raw && !lodging) return { category_name: '', category_icon: '', category: '' };
  const key = raw.toLowerCase();
  if (lodging || normalizeThingType(raw) === 'hotel') {
    const named = sourceCategoryName(thing);
    const category_name = named && !/^(hotel|lodging|accommodation|resort|motel|hostel|inn)$/i.test(named) ? named : 'Hotel';
    return { category_name, category_icon: '🏨', category: 'hotel' };
  }
  const known = {
    restaurant: ['Restaurant', '🍽️', 'restaurant'],
    store: ['Store', '🛍️', 'store'],
    shopping: ['Store', '🛍️', 'shopping'],
    transport: ['Transport', '🚕', 'transport'],
    attraction: ['Attraction', '🏛️', 'attraction'],
    bar: ['Bar', '☕', 'bar'],
    activity: ['activity', '🎯', 'activity'],
    tour: ['tour', '🎟️', 'tour'],
  }[key];
  if (known) return { category_name: known[0], category_icon: known[1], category: known[2] };
  return { category_name: raw, category_icon: '', category: key };
}
