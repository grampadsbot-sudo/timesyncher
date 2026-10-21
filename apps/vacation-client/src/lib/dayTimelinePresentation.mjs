import { placeName } from './listTabModel.mjs';

function text(value) {
  return String(value ?? '').trim();
}

function overrideFor(trip, place) {
  return trip?.thingOverrides?.[`place:${place.id}`] || {};
}

export function flightTimelineTitle(place, trip) {
  const raw = placeName(place);
  if (/^Flight option:/i.test(raw)) return raw;
  const override = overrideFor(trip, place);
  const blob = `${raw} ${text(override.summary || place.description || '')}`;
  const airlineMatch = blob.match(/\b(American|JetBlue|Southwest|United|Delta|Alaska|Spirit|Frontier)\b/i);
  const routeMatch = blob.match(/\b([A-Z]{3})\s*(?:→|->|—|-)\s*([A-Z]{3})\b/);
  if (airlineMatch && routeMatch) {
    const airline = airlineMatch[1];
    const label = /^american$/i.test(airline) ? `${airline} Airlines` : airline;
    return `${label} ${routeMatch[1]} → ${routeMatch[2]}`;
  }
  return text(raw.replace(/^\s*Flight option:\s*/i, '')) || raw;
}
