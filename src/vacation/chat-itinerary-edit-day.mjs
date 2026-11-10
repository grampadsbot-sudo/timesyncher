function clean(value, max = 500) {
  return String(value ?? '').trim().slice(0, max);
}

function dayForNumber(payload, dayNumber) {
  const days = Array.isArray(payload?.days) ? payload.days : [];
  return days.find((d) => Number(d.day_number) === Number(dayNumber)) || null;
}

export function dayNumbersForPlace(payload, placeId) {
  const days = Array.isArray(payload?.days) ? payload.days : [];
  const numbers = new Set();
  const placeKey = String(placeId);
  for (const day of days) {
    const rows = payload?.assignments?.[String(day.id)] || [];
    if (rows.some((row) => String(row.place_id ?? row.place?.id) === placeKey) && day.day_number != null) {
      numbers.add(Number(day.day_number));
    }
  }
  const override = payload?.thingOverrides?.[`place:${placeId}`] || {};
  for (const dayId of (Array.isArray(override.dayIds) ? override.dayIds : []).map(String)) {
    const day = days.find((d) => String(d.id) === dayId);
    if (day?.day_number != null) numbers.add(Number(day.day_number));
  }
  if (override.perDaySchedule && typeof override.perDaySchedule === 'object') {
    for (const dayId of Object.keys(override.perDaySchedule)) {
      const day = days.find((d) => String(d.id) === String(dayId));
      if (day?.day_number != null) numbers.add(Number(day.day_number));
    }
  }
  return [...numbers].filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
}

function formatDayChoiceLabels(payload, dayNumbers) {
  const days = Array.isArray(payload?.days) ? payload.days : [];
  return dayNumbers.map((num) => {
    const day = days.find((d) => Number(d.day_number) === Number(num));
    const title = clean(day?.title, 80);
    return title ? `Day ${num} (${title})` : `Day ${num}`;
  });
}

export function resolveItineraryEditDayNumber({
  payload, place, intent, customerTurn, anchorPlaceId = null,
} = {}) {
  const explicit = Number(intent?.dayNumber);
  if (Number.isFinite(explicit) && explicit > 0) return { dayNumber: explicit, reason: 'explicit' };
  let anchorPlace = place;
  if (anchorPlaceId && place && String(anchorPlace.id) !== String(anchorPlaceId)) {
    anchorPlace = (payload.places || []).find((p) => String(p.id) === String(anchorPlaceId)) || anchorPlace;
  }
  const targetId = anchorPlace?.id ?? place?.id;
  if (!targetId) return { dayNumber: null, reason: 'no_place' };
  const candidates = dayNumbersForPlace(payload, targetId);
  const night = /\b(that night|tonight|this night)\b/i.test(String(customerTurn || ''));
  if (night && candidates.length >= 1) return { dayNumber: candidates[0], reason: 'that_night', candidates };
  if (intent?.op === 'add_bar_before' && candidates.length >= 1) {
    return { dayNumber: candidates[0], reason: 'anchor_day', candidates };
  }
  if (candidates.length === 1) return { dayNumber: candidates[0], reason: 'single_day', candidates };
  if (candidates.length > 1) return { dayNumber: null, reason: 'ambiguous_day', candidates };
  return { dayNumber: null, reason: 'no_day', candidates };
}

export function dayEditSkipLabels(payload, place, dayResolve) {
  if (dayResolve.reason === 'ambiguous_day') {
    const labels = formatDayChoiceLabels(payload, dayResolve.candidates);
    return { reason: 'day_ambiguous', reply: `Ask which day they mean. Real options: ${labels.join('; ')}.`, candidates: labels };
  }
  const hints = formatDayChoiceLabels(payload, dayNumbersForPlace(payload, place.id));
  const hint = hints.length ? ` Real day options: ${hints.join('; ')}.` : '';
  return {
    reason: 'day_not_found',
    reply: `Ask which day they want for ${place.name || place.title}.${hint}`,
  };
}

function itineraryEditAuthoritativeLiveDraftExtra(turnActionResults) {
  const text = String(turnActionResults?.itineraryEditAuthoritative || '').trim().slice(0, 4000);
  if (!text) return '';
  return `${text} When AUTHORITATIVE_SYSTEM is present, ignore any rule that says chat cannot edit or needs website edit access.`;
}

export function applyItineraryEditAuthoritativeReplyFacts(ctx, turnActionResults) {
  const extra = itineraryEditAuthoritativeLiveDraftExtra(turnActionResults);
  if (!extra || !ctx || typeof ctx !== 'object') return ctx;
  const prior = String(ctx.roster || '').trim();
  return prior.includes(extra) ? ctx : { ...ctx, roster: [prior, extra].filter(Boolean).join(' ') };
}

export function buildItineraryEditAuthoritativeSystemExtra(result, payload = null) {
  if (!result?.applied) return '';
  const day = payload ? dayForNumber(payload, result.dayNumber) : null;
  const dayLabel = day?.title ? `Day ${result.dayNumber} (${clean(day.title, 120)})` : `Day ${result.dayNumber}`;
  const header = [
    'AUTHORITATIVE_SYSTEM: A chat itinerary edit already succeeded for this turn.',
    'Confirm the change in plain words. Never say chat cannot edit, that demo trips cannot be edited, or that website edit access is needed.',
  ].join(' ');
  if (result.op === 'set_time') {
    return `${header} ${result.placeName} on ${dayLabel} is now ${result.newTime} (was ${result.oldTime || 'unscheduled'}).`;
  }
  if (result.op === 'add_bar_before') {
    return `${header} Added ${result.barName} on ${dayLabel} at ${result.barStart}, ending before ${result.anchorName} at ${result.anchorTime}.`;
  }
  if (result.op === 'undo') return `${header} The last chat itinerary schedule change was undone.`;
  return header;
}
