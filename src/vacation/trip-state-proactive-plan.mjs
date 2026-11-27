import { assignDatesScheduling } from './intake-shared-trip.mjs';
import { parseTimeToHHMM, minutesFromHHMM } from './chat-itinerary-edit-day.mjs';
import { proactivePlanBlocks } from './trip-state-action-input.mjs';
import { digestTripState } from './trip-state-action-site.mjs';
import { isTripThingName, normalizeTripThingName } from './trip-thing-name-shape.mjs';

const version = 1;
const maxOperations = 32;
const wantedTypes = {
  hotel: 'hotel', park: 'park', activity: 'activity', restaurant: 'restaurant', meal: 'meal',
  family_event: 'activity', flight: 'flight_option', car: 'other', store: 'other',
};
const timing = /\b(?:[01]?\d|2[0-3]):[0-5]\d(?:\s*[ap]\.?m\.?)?|\b(?:1[0-2]|0?[1-9])\s*[ap]\.?m\.?/i;
const pacePattern = /\b(?:slow|relaxed|easy|leisurely|low[- ]key)\s+(?:pace|days|trip)|\b(?:take it easy|don't pack|downtime|one (?:activity|thing) per day)\b/i;
const budgetPattern = /(?:\$|USD\s*)\d[\d,]*(?:\.\d\d)?|\b(?:on a budget|budget-friendly|inexpensive|low-cost|free activities)\b/i;

export function proactiveResearchKey(trip) {
  const destination = normalizeTripThingName(trip.destination);
  if (!destination || !trip.start_date || !trip.end_date || trip.start_date > trip.end_date) return null;
  return `plan-${digestTripState([trip.id, destination, trip.start_date, trip.end_date, version]).slice(0, 48)}`;
}

export function proactiveCriteria(state, history) {
  const facts = Object.values(state.disclosed);
  const budget = facts.filter(({ kind }) => kind === 'budget').at(-1)?.value
    || history.map(({ text }) => text.match(budgetPattern)?.[0]).filter(Boolean).at(-1);
  const relaxed = facts.some(({ kind, value }) => kind === 'pace' && /\b(?:slow|relaxed|easy|leisurely)\b/i.test(value))
    || history.some(({ text }) => pacePattern.test(text));
  const ageMatches = [
    ...Object.values(state.saved.travelers)
      .filter(({ relation, age }) => relation === 'child' && /^\d{1,2}$/.test(age || ''))
      .map(({ age }) => age),
    ...facts.filter(({ kind }) => kind === 'party')
      .flatMap(({ value }) => [...String(value).matchAll(/\b(?:ages?\s+(\d{1,2})(?:\s*(?:and|,)\s*(\d{1,2}))?|(\d{1,2})[- ]year[- ]olds?)\b/gi)]
        .flatMap((match) => [match[1], match[2], match[3]]).filter(Boolean)),
    ...history
      .flatMap(({ text }) => [...String(text || '').matchAll(/\b(?:ages?\s+(\d{1,2})(?:\s*(?:and|,)\s*(\d{1,2}))?|(\d{1,2})[- ]year[- ]olds?)\b/gi)]
        .flatMap((match) => [match[1], match[2], match[3]]).filter(Boolean)),
  ];
  const ages = [...new Set(ageMatches)];
  const family = ages.length > 0 || history.some(({ text }) => /\b(?:kids|children|toddler|family-friendly)\b/i.test(text));
  return {
    relaxed,
    budget,
    search: [family ? `family-friendly${ages.length ? ` for ages ${ages.join(' and ')}` : ''}` : '',
      budget ? `budget-friendly ${budget}` : '', relaxed ? 'low-key, easy pace' : ''].filter(Boolean),
  };
}

function wantedItems(history, dates, spans) {
  const items = new Map();
  for (const { text, things, turn } of history) {
    for (const wanted of Array.isArray(things) ? things : []) {
      const title = String(wanted?.name || wanted?.title || '').trim();
      const type = wantedTypes[wanted?.kind];
      const start = text.toLowerCase().indexOf(title.toLowerCase());
      if (!type || start < 0 || !isTripThingName(title)) continue;
      const code = digestTripState([turn, start, title]).slice(0, 32);
      const evidence = `place-${code}`;
      spans[evidence] = { kind: 'place', start, end: start + title.length, turn };
      const when = String(wanted.when || '').trim();
      const statedWhen = when && text.toLowerCase().includes(when.toLowerCase()) ? when : '';
      const { dates: [date] } = assignDatesScheduling({ when: statedWhen }, Number(dates[0].slice(0, 4)), dates);
      const clock = timing.exec(statedWhen);
      const value = clock && parseTimeToHHMM(clock[0]);
      let time, time_evidence;
      if (value) {
        const offset = text.toLowerCase().indexOf(statedWhen.toLowerCase()) + clock.index;
        const precision = /\b(?:about|around|roughly|approximately)\b/i.test(statedWhen) ? 'approximate' : 'exact';
        time_evidence = `time-${code}`;
        spans[time_evidence] = { kind: 'time', start: offset, end: offset + clock[0].length, turn, precision };
        time = { value, precision };
      }
      items.set(normalizeTripThingName(title), { title, type, evidence, date, time, time_evidence });
    }
  }
  return [...items.values()].sort((a, b) => Number(Boolean(b.date)) - Number(Boolean(a.date)));
}

function proposed(value) {
  return { value, precision: 'proposed' };
}

function role(type) {
  return type === 'flight_option' ? 'leg' : type === 'ground_ride' ? 'ride' : 'visit';
}

function slot(day, type) {
  const choices = ['meal', 'restaurant'].includes(type) ? ['12:30', '18:00', '08:00'] : ['10:00', '14:30', '16:30'];
  return choices.find((time) => day.times.every((other) => Math.abs(minutesFromHHMM(time) - minutesFromHHMM(other)) >= 90));
}

export function buildProactivePlan({ state, saved, history, criteria, key }) {
  const days = Object.entries(saved.days).sort(([, a], [, b]) => a.date.localeCompare(b.date))
    .map(([id, day]) => ({ id, date: day.date, count: day.assigned.length,
      times: day.assigned.map(({ time }) => time?.value).filter((value) => /^\d{2}:\d{2}$/.test(value)) }));
  if (!days.length) {
    return {
      operations: [], gaps: [],
      authority: { source: 'system_plan', id: key, researchKey: key, planKey: key, spans: {} },
    };
  }
  const assigned = new Set(Object.values(saved.days).flatMap(({ assigned }) => assigned.map(({ item }) => item)));
  const savedByName = new Map(Object.entries(saved.items).map(([id, item]) => [normalizeTripThingName(item.title), { id, ...item }]));
  const gaps = [];
  const spans = {};
  const wanted = wantedItems(history, days.map(({ date }) => date), spans);
  const wantedNames = new Set(wanted.map(({ title }) => normalizeTripThingName(title)));
  const savedMustDos = Object.entries(saved.items)
    .filter(([id, item]) => !assigned.has(id)
      && !wantedNames.has(normalizeTripThingName(item.title))
      && item.via !== 'search'
      && !Object.hasOwn(proactivePlanBlocks, item.title)
      && isTripThingName(item.title))
    .map(([, item]) => ({ title: item.title, type: item.type }));
  const allWanted = [...wanted, ...savedMustDos];
  const allWantedNames = new Set(allWanted.map(({ title }) => normalizeTripThingName(title)));
  const candidates = Object.values(state.candidates)
    .filter(({ title, type }) => {
      const norm = normalizeTripThingName(title);
      if (allWantedNames.has(norm)) return false;
      const existing = savedByName.get(norm);
      return !existing || (existing.type === type && !assigned.has(existing.id));
    });
  const operations = [];
  const limit = criteria.relaxed ? 1 : 2;
  const first = days[0], last = days.at(-1);

  function room(day, extra = 1) {
    const uncovered = days.filter((row) => row.count === 0 && row !== day).length;
    return operations.length + extra + uncovered <= maxOperations;
  }

  function place(entry, day, existing) {
    const { title, type, evidence, result_id, time_evidence } = entry;
    const time = entry.time || proposed(slot(day, type) || '10:00');
    const placement = { day: day.id, role: role(existing?.type || type), time, ...(time_evidence ? { time_evidence } : {}) };
    if (existing) operations.push({ op: 'place_on_day', args: { item: existing.id, ...placement } });
    else if (result_id) operations.push({ op: 'add_from_search', args: { candidate: result_id, ...placement } });
    else operations.push({ op: 'add_named_item', args: { type, label: title, evidence, ...placement,
      ...(type === 'flight_option' ? { details: { direction: 'other' } } : {}) } });
    day.count += 1;
    day.times.push(time.value);
  }

  const namedHotel = allWanted.find(({ type }) => type === 'hotel');
  const currentHotel = [...savedByName.values()].find(({ type, id }) => type === 'hotel' && assigned.has(id));
  const hotel = namedHotel || (!currentHotel && candidates.find(({ type }) => type === 'hotel'));
  if (hotel && first !== last && !currentHotel && room(first, 2)) {
    const existing = savedByName.get(normalizeTripThingName(hotel.title));
    const target = existing?.type === 'hotel' ? existing.id : '$hotel';
    if (target === '$hotel') {
      operations.push(hotel.result_id
        ? { op: 'add_from_search', args: { candidate: hotel.result_id }, as: 'hotel' }
        : { op: 'add_named_item', args: { type: 'hotel', label: hotel.title, evidence: hotel.evidence }, as: 'hotel' });
    }
    operations.push({ op: 'set_stay', args: {
      hotel: target, check_in: first.id, check_out: last.id,
      check_in_time: proposed('16:00'), check_out_time: proposed('09:00'),
    } });
    first.count += 1;
    first.times.push('16:00');
    last.count += 1;
    last.times.push('09:00');
  }
  for (const entry of allWanted) {
    const existing = savedByName.get(normalizeTripThingName(entry.title));
    if (assigned.has(existing?.id) || (entry === hotel && first !== last && operations.some(({ op }) => op === 'set_stay'))) continue;
    const explicitDay = days.find(({ date }) => date === entry.date);
    const ranked = explicitDay ? [explicitDay] : [...days].sort((a, b) => a.count - b.count);
    const day = ranked.find((row) => row.count < 3 && room(row) && (entry.time || slot(row, entry.type)));
    if (day) place(entry, day, existing);
    else gaps.push(`Still to schedule: ${entry.title}`);
  }

  const options = candidates.filter(({ type }) => ['park', 'restaurant'].includes(type));
  for (const day of days) {
    if (day.count >= limit || !room(day)) continue;
    const edge = first !== last && (day === first || day === last);
    const optionIndex = options.findIndex(({ type }) => (!edge || type === 'restaurant') && slot(day, type));
    if (optionIndex >= 0) {
      const [option] = options.splice(optionIndex, 1);
      place(option, day, savedByName.get(normalizeTripThingName(option.title)));
    }
    if (day.count) continue;
    const title = day === first && edge ? 'Settle in and get oriented'
      : day === last && edge ? 'Pack and get ready to leave' : 'Free time to explore nearby';
    place({ title, type: proactivePlanBlocks[title] }, day, savedByName.get(normalizeTripThingName(title)));
  }
  return {
    operations, gaps,
    authority: { source: 'system_plan', id: key, researchKey: key, planKey: key, spans },
  };
}
