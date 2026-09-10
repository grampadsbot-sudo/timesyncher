import {
  inferThingTypeFromText,
  looksLikeFlightText,
  resolveThingType,
  thingLogoUrl,
  timelineIcon,
} from '../src/vacation/timeline-icons.mjs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const carbone = {
  name: 'Carbone at Aria',
  category_name: 'Restaurant',
  category_icon: '🍽️',
  address: 'Aria, Las Vegas',
  notes: 'Kim TG note',
  description: 'Added from Kim TG collaborator note',
};
const shake = {
  name: 'Shake Shack near Cosmo/Aria',
  category_name: 'Restaurant',
  category_icon: '🍽️',
  address: 'Las Vegas Strip',
};
const shops = {
  name: 'Cosmopolitan shops',
  category_name: 'Store',
  category_icon: 'ShoppingBag',
  address: 'The Cosmopolitan, Las Vegas',
};
const outbound = {
  name: 'SFO to LAS Thu Oct 9',
  category_name: 'Transport',
  category_icon: '🚌',
  address: 'SFO to LAS',
};
const inbound = {
  name: 'LAS to SFO Sun Oct 12',
  category_name: 'Transport',
  category_icon: '🚌',
  address: 'LAS to SFO',
};
const lodging = {
  name: 'Las Vegas lodging research queue',
  category_name: 'Hotel',
  category_icon: '🏨',
  address: 'Las Vegas',
};
const conservatory = {
  name: 'Bellagio Conservatory — Anniversary Cocktails',
  category_name: 'Attraction',
  category_icon: '🏛️',
  address: 'Las Vegas',
};
const withLogo = {
  name: 'Carbone at Aria',
  category_name: 'Restaurant',
  image_url: 'https://example.com/carbone.png',
};

assert(!looksLikeFlightText('Carbone at Aria, Las Vegas'), 'Las Vegas restaurant text is not a flight');
assert(!looksLikeFlightText('Cosmopolitan shops, The Cosmopolitan, Las Vegas'), 'Las Vegas store text is not a flight');
assert(looksLikeFlightText('SFO to LAS Thu Oct 9'), 'SFO to LAS is a flight');
assert(looksLikeFlightText('LAS to SFO Sun Oct 12'), 'LAS to SFO is a flight');
assert(inferThingTypeFromText('Las Vegas Strip Shake Shack') !== 'flight', 'Strip restaurant does not infer flight');

assert(timelineIcon(carbone).icon === '🍽️', 'Carbone uses restaurant icon');
assert(timelineIcon(carbone).isFlight === false, 'Carbone is not a flight');
assert(timelineIcon(shake).icon === '🍽️', 'Shake Shack uses restaurant icon');
assert(timelineIcon(shops).icon === '🛍️', 'Cosmopolitan shops uses store icon');
assert(timelineIcon(outbound).icon === '✈️', 'Outbound flight keeps airplane');
assert(timelineIcon(inbound).icon === '✈️', 'Return flight keeps airplane');
assert(timelineIcon(lodging, { category: 'hotel' }).icon === '🧳', 'Hotel override uses lodging icon');
assert(timelineIcon(conservatory, { category: 'other' }).icon === '🏛️', 'other override does not beat Attraction');
assert(timelineIcon(carbone, { category: 'other' }).icon === '🍽️', 'other override does not beat Restaurant');
assert(thingLogoUrl(withLogo) === 'https://example.com/carbone.png', 'image_url is used as thing logo');
assert(timelineIcon(withLogo).logoUrl === 'https://example.com/carbone.png', 'logo wins over category icon when present');
assert(resolveThingType({ name: 'Random Las Vegas walk' }) !== 'flight', 'bare Las Vegas text is not a flight');

console.log('timeline icon tests passed');
