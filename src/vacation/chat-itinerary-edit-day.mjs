function clean(value, max = 500) {
  return String(value ?? '').trim().slice(0, max);
}

export function parseTimeToHHMM(raw) {
  let s = clean(raw, 40).toLowerCase().replace(/\./g, '');
  if (!s) return null;
  const m = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (!m) return null;
  let hours = Number(m[1]);
  const minutes = m[2] != null ? Number(m[2]) : 0;
  const meridiem = m[3];
  if (meridiem === 'pm' && hours < 12) hours += 12;
  if (meridiem === 'am' && hours === 12) hours = 0;
  if (hours > 23 || minutes > 59) return null;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

export function minutesFromHHMM(hhmm) {
  const parts = clean(hhmm, 12).split(':');
  if (parts.length !== 2) return null;
  const h = Number(parts[0]);
  const m = Number(parts[1]);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

export function hhmmFromMinutes(total) {
  const normalized = ((Math.round(total) % (24 * 60)) + 24 * 60) % (24 * 60);
  const h = Math.floor(normalized / 60);
  const m = normalized % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

const CHAT_ITINERARY_SCHEDULE_OVERRIDE_KEYS = [
  'timeline', 'dayIds', 'perDaySchedule', 'duration', 'startTime',
];

function chatItineraryScheduleOverridePatch(overrideRow = {}) {
  if (!overrideRow || typeof overrideRow !== 'object') return {};
  const patch = {};
  for (const key of CHAT_ITINERARY_SCHEDULE_OVERRIDE_KEYS) {
    if (overrideRow[key] === undefined) continue;
    patch[key] = structuredClone(overrideRow[key]);
  }
  return patch;
}

export function mergeStoredChatItineraryScheduleOverride(storedRow = {}, desiredRow = {}) {
  const stored = storedRow && typeof storedRow === 'object' ? storedRow : {};
  const desired = desiredRow && typeof desiredRow === 'object' ? desiredRow : {};
  const desiredPatch = chatItineraryScheduleOverridePatch(desired);
  const merged = chatItineraryScheduleOverridePatch(stored);
  for (const key of CHAT_ITINERARY_SCHEDULE_OVERRIDE_KEYS) {
    if (desiredPatch[key] === undefined) continue;
    if (key === 'perDaySchedule') {
      const base = { ...(merged.perDaySchedule || {}) };
      for (const [dayId, dayVal] of Object.entries(desiredPatch.perDaySchedule || {})) {
        const prior = base[dayId] && typeof base[dayId] === 'object' ? { ...base[dayId] } : {};
        base[dayId] = {
          ...prior,
          ...(dayVal && typeof dayVal === 'object' ? dayVal : {}),
        };
      }
      merged.perDaySchedule = base;
    } else {
      merged[key] = structuredClone(desiredPatch[key]);
    }
  }
  return merged;
}

export function buildChatItineraryOverridesPutBody({ before = {}, after = {}, keys = [], stored = {} } = {}) {
  const storedMap = stored && typeof stored === 'object' ? stored : {};
  const patch = {};
  for (const [storedKey, storedRow] of Object.entries(storedMap)) {
    const scheduleRow = chatItineraryScheduleOverridePatch(storedRow);
    if (Object.keys(scheduleRow).length) patch[storedKey] = scheduleRow;
  }
  for (const key of keys) {
    const afterRow = after[key];
    const beforeRow = before[key];
    const source = afterRow && typeof afterRow === 'object' && Object.keys(afterRow).length
      ? afterRow
      : beforeRow;
    const storedRow = storedMap[key];
    if (source && typeof source === 'object' && Object.keys(source).length) {
      patch[key] = mergeStoredChatItineraryScheduleOverride(storedRow, source);
    } else {
      patch[key] = {};
    }
  }
  return patch;
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

export function buildItineraryEditFailureAuthoritativeSystemExtra(reason = 'edit_failed') {
  if (reason === 'web_edit_access_required' || reason === 'web_edit_denied') return '';
  return [
    'AUTHORITATIVE_SYSTEM: The itinerary change did not save for this turn.',
    'Tell the customer plainly that the change did not save and they should try again.',
    'Never say chat cannot edit, that demo trips cannot be edited, that website edit access is needed, or argue about schedule conflicts.',
  ].join(' ');
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
    return `${header} Done: ${result.placeName} on ${dayLabel} is now ${result.newTime} (was ${result.oldTime || 'unscheduled'}).`;
  }
  if (result.op === 'add_bar_before') {
    return `${header} Added ${result.barName} on ${dayLabel} at ${result.barStart}, ending before ${result.anchorName} at ${result.anchorTime}.`;
  }
  if (result.op === 'undo') return `${header} The last chat itinerary schedule change was undone.`;
  return header;
}

export async function assertChatEditPutStaysSmallUnderHugeOverrides(runTurn, { payload, putCapture }) {
  let tinyPut = null;
  const turn = await runTurn({
    fetchPayload: async () => structuredClone(payload),
    putOverrides: async ({ overrides }) => { tinyPut = overrides; },
  });
  if (!turn?.applied) throw new Error(`oversize_turn_failed ${turn?.reason || 'unknown'}`);
  const keys = Object.keys(tinyPut || {});
  if (keys.length !== 1) throw new Error(`oversize_put_keys ${keys.join(',')}`);
  const bytes = Buffer.byteLength(JSON.stringify({ overrides: tinyPut }), 'utf8');
  if (bytes > 256 * 1024) throw new Error(`oversize_put_bytes ${bytes}`);
  if (tinyPut[keys[0]].evidenceDossier != null) throw new Error('oversize_put_carried_dossier');
  putCapture?.(tinyPut);
  return turn;
}
