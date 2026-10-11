import {
  isAirplaneGlyph,
  resolveThingType,
  sanitizeTimelineGlyph,
  thingLogoUrl,
  timelineIcon,
} from '../src/vacation/timeline-icons.mjs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const placeA = {
  name: 'Sample place A',
  category_name: 'Restaurant',
  category_icon: '🍽️',
  address: 'Sample road',
  notes: 'Sample note',
  description: 'Added from a sample note',
};
const placeB = {
  name: 'Sample place B',
  category_name: 'Restaurant',
  category_icon: '🍽️',
  address: 'Sample road',
};
const placeC = {
  name: 'Sample place C',
  category_name: 'Store',
  category_icon: 'ShoppingBag',
  address: 'Sample road',
};
const outbound = {
  name: 'Sample transfer',
  category_name: 'Transport',
  category_icon: '🚌',
  address: 'Sample route',
};
const inbound = {
  name: 'Sample return',
  category_name: 'Transport',
  category_icon: '🚌',
  address: 'Sample route',
};
const lodging = {
  name: 'Sample lodging',
  category_name: 'Hotel',
  category_icon: '🏨',
  address: 'Sample road',
};
const attraction = {
  name: 'Sample place D',
  category_name: 'Attraction',
  category_icon: '🏛️',
  address: 'Sample road',
};
const withLogo = {
  name: 'Sample place A',
  category_name: 'Restaurant',
  image_url: 'https://example.com/sample-place.png',
};

assert(timelineIcon(placeA).icon === '🍽️', 'a restaurant uses the restaurant icon');
assert(timelineIcon(placeA).isFlight === false, 'a restaurant is not a flight');
assert(timelineIcon(placeB).icon === '🍽️', 'a second restaurant uses the restaurant icon');
assert(timelineIcon(placeC).icon === '🛍️', 'a store uses the store icon');
assert(timelineIcon(outbound).icon === '🚕', 'transport category stays transport');
assert(timelineIcon(inbound).icon === '🚕', 'return transport stays transport');
assert(timelineIcon({ name: 'Thursday departure', category_name: 'Flight' }).icon === '✈️', 'flight category uses airplane');
assert(timelineIcon(lodging, { category: 'hotel' }).icon === '🧳', 'Hotel override uses lodging icon');
assert(timelineIcon(attraction, { category: 'other' }).icon === '🏛️', 'other override does not beat Attraction');
assert(timelineIcon(placeA, { category: 'other' }).icon === '🍽️', 'other override does not beat Restaurant');
assert(thingLogoUrl(withLogo) === 'https://example.com/sample-place.png', 'image_url is used as thing logo');
assert(timelineIcon(withLogo).logoUrl === 'https://example.com/sample-place.png', 'logo wins over category icon when present');
assert(resolveThingType({ name: 'Sample walk' }) !== 'flight', 'a plain name is not a flight');
assert(resolveThingType({ name: 'Sample place D', category_name: 'Attraction' }) !== 'flight', 'an attraction is not a flight');
assert(resolveThingType({ name: 'Sample place D', category_name: 'Attraction' }) !== 'car', 'an attraction is not a car');
assert(timelineIcon(placeA, { icon: '✈️' }).icon === '🍽️', 'stored airplane icon is not used for restaurants');
assert(timelineIcon(placeC, { icon: 'Plane' }).icon === '🛍️', 'Plane lucide is not a missing-logo fallback');
assert(sanitizeTimelineGlyph('✈️', 'restaurant') === '🍽️', 'sanitize strips airplane from restaurants');
assert(sanitizeTimelineGlyph('✈️', 'flight') === '✈️', 'sanitize keeps airplane on flights');
assert(isAirplaneGlyph('✈️') === true, 'airplane glyph detected');
assert(timelineIcon({ name: 'Sample research queue', category_name: 'Attraction' }).isFlight === false, 'a research queue is not a flight');
assert(resolveThingType({ name: 'Sample Hotel' }) === 'other', 'a name alone has no icon type');
assert(resolveThingType({ name: 'City A to City B' }) === 'other', 'a route name alone is not a flight');
assert(resolveThingType({ name: 'Sample Rental' }) === 'other', 'a rental name alone is not a car');
assert(resolveThingType(outbound) === 'transport', 'transport category is not upgraded from the name');
assert(resolveThingType({ name: 'Sample Hotel', category_name: 'Hotel' }) === 'hotel', 'source category selects the icon');
assert(resolveThingType({ name: 'City A to City B', category_name: 'Flight' }) === 'flight', 'flight category selects the icon');
assert(resolveThingType({ name: 'Sample Rental', category_name: 'Car' }) === 'car', 'car category selects the icon');
assert(resolveThingType({ name: 'Hertz counter', category: 'car' }) === 'car', 'string trip_things category selects car');
assert(
  resolveThingType({
    name: 'Hertz Car Rental',
    category: 'store',
    category_name: 'Store',
    metadata: { providerCategories: ['Store', 'Car rental'] },
  }) === 'car',
  'car rental provider category overrides store category',
);

console.log('timeline icon tests passed');
