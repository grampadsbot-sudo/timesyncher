import { thingTravelTotalPrice } from './thing-travel-total-price.mjs';

const PER_PERSON_CATEGORIES = new Set([
  'restaurant', 'store', 'event', 'family_event', 'tour', 'transport', 'music',
  'workout', 'artist', 'theatre', 'sightseeing', 'other', 'flight',
]);

function positive(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

export function thingPeople(place = {}, override = {}, shared = {}) {
  const explicit = positive(override.people ?? place.people);
  if (Number.isInteger(explicit)) return explicit;
  const party = shared.trip?.metadata?.dialogParty || {};
  const travelers = [party.primary, ...(party.collaborators || []), ...(party.preference_subjects || [])];
  const names = new Set(travelers.map((person) => String(person?.name || '').trim().toLowerCase()).filter(Boolean));
  return names.size || 2;
}

export function perPersonThing(place = {}, override = {}, category = '') {
  const row = { ...place, ...override };
  return row.pricePerPerson != null || PER_PERSON_CATEGORIES.has(String(category).toLowerCase())
    || /per person|pp|fare|ticket|flight/i.test(String(row.price || ''));
}

function stayDays(row) {
  const explicit = positive(row.stayDays);
  if (explicit) return Math.round(explicit);
  const start = Date.parse(`${row.checkInDate || row.check_in_date || ''}T00:00:00Z`);
  const end = Date.parse(`${row.checkOutDate || row.check_out_date || ''}T00:00:00Z`);
  return end > start ? Math.max(1, Math.round((end - start) / 86400000)) : 7;
}

function parseStoredRate(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
  const match = String(value).trim().match(/\$?\s*([0-9][0-9,]*(?:\.\d+)?)/);
  return match ? Number(match[1].replace(/,/g, '')) : null;
}

export function thingBudgetAmount(place = {}, override = {}, category = '', shared = {}) {
  const cat = String(category).toLowerCase();
  if (cat === 'hotel' || cat === 'car') {
    const row = { ...place, ...override };
    const total = thingTravelTotalPrice(place, override, cat, shared);
    if (total.hasPrice) {
      const nightly = cat === 'hotel' && total.estimated
        ? parseStoredRate(row.price ?? place.price)
        : null;
      return { amount: total.amount, hasPrice: true, nightly };
    }
    return { amount: 0, hasPrice: false, nightly: null };
  }
  const row = { ...place, ...override };
  const perPerson = perPersonThing(place, override, category);
  const explicit = row.pricePerPerson != null && row.pricePerPerson !== '' ? Number(row.pricePerPerson) : null;
  const price = String(row.price ?? '');
  const numbers = [...price.matchAll(/\$?([0-9][0-9,]*(?:\.\d+)?)/g)]
    .map((match) => Number(match[1].replace(/,/g, ''))).filter(Number.isFinite);
  const unit = perPerson && Number.isFinite(explicit) && explicit >= 0 ? explicit
    : numbers.length > 1 ? (numbers[0] + numbers[1]) / 2 : numbers[0];
  if (unit == null) return { amount: 0, hasPrice: false, nightly: null };
  let amount = unit;
  if (String(category).toLowerCase() === 'hotel' || /night/i.test(price)) amount *= stayDays(row);
  if (perPerson) amount *= thingPeople(place, override, shared);
  return { amount: Math.round(amount), hasPrice: true, nightly: unit };
}
