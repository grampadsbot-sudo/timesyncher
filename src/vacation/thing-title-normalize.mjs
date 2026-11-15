const FLIGHT_OPTION_PREFIX = /^\s*Flight option:\s*/i;
const PIPELINE_DOCUMENTED_OPTION = /^Documented .+ option\b/i;
const FLIGHT_ISO_DATE_RE = /\b\d{4}-\d{2}-\d{2}\b/g;
const FLIGHT_TIME_RANGE_RE =
  /\b\d{1,2}:\d{2}(?::\d{2})?(?:\s*[-–—]\s*\d{1,2}:\d{2}(?::\d{2})?)?(?:\+\d+)?\b/gi;
const FLIGHT_LONE_TIME_RE = /\b\d{1,2}:\d{2}(?::\d{2})?\b/g;
const FLIGHT_ROUTE_PAIR_RE = /\b([A-Z]{3})\s*(?:[-–—→]|(?:\s+to\s+))\s*([A-Z]{3})\b/i;
const FLIGHT_ROUTE_DASH_RE = /\b([A-Z]{3})-([A-Z]{3})\b/;
const FLIGHT_ROUTE_BLOB_RE = /\bRoute:\s*([A-Z]{3})\s*[-–—]\s*([A-Z]{3})\b/i;

function text(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function stripFlightOptionTitlePrefix(value = '') {
  return text(String(value).replace(FLIGHT_OPTION_PREFIX, ''));
}

export function stripFlightScheduleFromTitle(value = '') {
  let row = stripFlightOptionTitlePrefix(value);
  row = row.replace(FLIGHT_ISO_DATE_RE, ' ');
  row = row.replace(FLIGHT_TIME_RANGE_RE, ' ');
  row = row.replace(FLIGHT_LONE_TIME_RE, ' ');
  row = row.replace(/\s*\+\d+\b/g, ' ');
  return text(row);
}

function parseFlightRoutePair(value = '') {
  const row = stripFlightScheduleFromTitle(value);
  let match = row.match(FLIGHT_ROUTE_PAIR_RE);
  if (!match) match = row.match(FLIGHT_ROUTE_DASH_RE);
  if (!match) return null;
  return {
    dep: match[1].toUpperCase(),
    arr: match[2].toUpperCase(),
    index: match.index ?? 0,
  };
}

function routeFromHints(hints = {}) {
  const route = text(hints.route);
  if (route) {
    const dash = route.match(/\b([A-Z]{3})\s*[-–—]\s*([A-Z]{3})\b/i);
    if (dash) return { dep: dash[1].toUpperCase(), arr: dash[2].toUpperCase(), index: 0 };
  }
  const blob = String(hints.blob ?? '');
  const fromBlob = blob.match(FLIGHT_ROUTE_BLOB_RE);
  if (fromBlob) return { dep: fromBlob[1].toUpperCase(), arr: fromBlob[2].toUpperCase(), index: 0 };
  return null;
}

export function formatFlightCardTitle(value = '', hints = {}) {
  const raw = text(value);
  if (!raw) return '';
  const cleaned = stripFlightScheduleFromTitle(raw);
  const route = parseFlightRoutePair(raw) || routeFromHints(hints);
  if (!route) return cleaned;
  let airline = route.index > 0 ? text(cleaned.slice(0, route.index)) : '';
  if (!airline && hints.airline) airline = text(hints.airline);
  if (!airline) {
    const tokens = cleaned.split(/\s+/).filter(Boolean);
    const depIdx = tokens.findIndex((token) => token.toUpperCase().startsWith(route.dep));
    if (depIdx > 0) airline = tokens.slice(0, depIdx).join(' ');
  }
  if (!airline) return cleaned;
  return `${airline} ${route.dep} to ${route.arr}`;
}

export function stripPipelineItineraryStub(value = '') {
  const row = String(value ?? '');
  const trimmed = row.trim();
  if (!trimmed) return '';
  if (PIPELINE_DOCUMENTED_OPTION.test(trimmed)) return '';
  return row;
}
