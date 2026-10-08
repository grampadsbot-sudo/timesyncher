/** Picks a Thing's own site logo from web search results for "<name> <city>". */

const LISTING_HOSTS = [
  'tripadvisor', 'yelp', 'booking.com', 'expedia', 'hotels.com', 'kayak', 'priceline', 'agoda', 'trip.com',
  'travelocity', 'orbitz', 'hotwire', 'trivago', 'wikipedia', 'wikidata', 'facebook', 'instagram', 'twitter.com',
  'x.com', 'tiktok', 'youtube', 'pinterest', 'linkedin', 'reddit', 'google.', 'goo.gl', 'apple.com/maps', 'mapquest',
  'foursquare', 'opentable', 'resy.com', 'timeout.com', 'lonelyplanet', 'fodors', 'frommers', 'cntraveler',
  'eater.com', 'infatuation', 'thrillist', 'nymag', 'nytimes', 'cnn.com', 'forbes', 'usnews', 'groupon', 'viator',
  'getyourguide', 'klook', 'tiqets', 'stubhub', 'ticketmaster', 'seatgeek', 'eventbrite', 'bandsintown',
];

function text(value, max = 160) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function hostOf(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return '';
    return parsed.hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

const GENERIC_WORDS = new Set(['hotel', 'hotels', 'restaurant', 'store', 'shop', 'club', 'airport', 'rental', 'official', 'site']);

function words(value) {
  return text(value).toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);
}

function nameTokens(name, city) {
  const place = new Set(words(city));
  return words(name).filter((word) => word.length >= 4 && !GENERIC_WORDS.has(word) && !place.has(word));
}

export function thingLogoQuery({ name, city, kind } = {}) {
  const label = text(name);
  if (!label) return '';
  const place = text(city, 80);
  const lead = kind === 'flight' ? label.split(/\s+/)[0] : label;
  const where = kind === 'flight' || kind === 'car' ? '' : place;
  return [lead, where, 'official site'].filter(Boolean).join(' ');
}

function listingHost(host) {
  return LISTING_HOSTS.some((needle) => host.includes(needle));
}

function resultLogo(result, host) {
  const candidates = [result?.profile?.img, result?.meta_url?.favicon];
  for (const value of candidates) {
    const src = text(value, 600);
    if (/^https:\/\//i.test(src)) return src;
  }
  return host ? `https://${host}/favicon.ico` : '';
}

export function pickThingLogo(results = [], { name, city } = {}) {
  const rows = (Array.isArray(results) ? results : [])
    .map((result) => ({ result, host: hostOf(result?.url) }))
    .filter((row) => row.host && !listingHost(row.host));
  if (!rows.length) return null;
  const tokens = nameTokens(name, city);
  const named = rows.find((row) => tokens.some((token) => row.host.replace(/[^a-z0-9]/g, '').includes(token)));
  const best = named || rows[0];
  const logoUrl = resultLogo(best.result, best.host);
  if (!logoUrl) return null;
  return { logoUrl, site: `https://${best.host}/`, matchedName: Boolean(named) };
}
