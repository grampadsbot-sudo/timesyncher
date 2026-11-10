import { readCookie, requireWebEditAccess, webAccessCookieName } from './web-access.mjs';
import { invalidateSharedUpstreamCacheForSlug as dropSharedUpstreamCacheForSlug } from './shared-trip-upstream-cache.mjs';
import {
  coalesceChatItineraryEditIntent,
  extractItineraryEditIntent,
  normalizeItineraryPlaceQuery,
  offlineParseItineraryEditIntent,
} from './chat-itinerary-edit-intent.mjs';
import {
  buildChatItineraryOverridesPutBody,
  buildItineraryEditAuthoritativeSystemExtra,
  DEMO_LOCKED_CHAT_EDIT_CUSTOMER_REPLY,
  buildItineraryEditFailureAuthoritativeSystemExtra,
  assignedDayNumbersForPlace,
  dayEditSkipLabels,
  dayNumbersForPlace,
  hhmmFromMinutes,
  mergeStoredChatItineraryScheduleOverride,
  minutesFromHHMM,
  parseTimeToHHMM,
  resolveItineraryEditDayNumber,
} from './chat-itinerary-edit-day.mjs';
import {
  findPlaceAssignment,
  placeAssignedOnDay,
} from './chat-itinerary-edit-assignment.mjs';
import { shareSlugEditGuardDecision } from './chat-itinerary-edit-slug-guard.mjs';
import { ensurePlaceAssignedOnDay, putSharedTripOverrides, trekPublicBase } from './chat-itinerary-edit-trek-write.mjs';

export { loadChatItineraryEditConfig, shareSlugEditGuardDecision } from './chat-itinerary-edit-slug-guard.mjs';

export {
  coalesceChatItineraryEditIntent,
  normalizeItineraryPlaceQuery,
  offlineParseItineraryEditIntent,
} from './chat-itinerary-edit-intent.mjs';
export {
  assertChatEditPutStaysSmallUnderHugeOverrides,
  buildChatItineraryOverridesPutBody,
  buildItineraryEditAuthoritativeSystemExtra,
  DEMO_LOCKED_CHAT_EDIT_CUSTOMER_REPLY,
  buildItineraryEditFailureAuthoritativeSystemExtra,
  dayNumbersForPlace,
  mergeStoredChatItineraryScheduleOverride,
  resolveItineraryEditDayNumber,
} from './chat-itinerary-edit-day.mjs';

const BAR_SIGNAL = /\b(bar|wine\s*bar|cocktail|jazz\s*bar|pub)\b/i;

function clean(value, max = 500) {
  return String(value ?? '').trim().slice(0, max);
}

function normalizeName(value) {
  return clean(value, 240).toLowerCase().replace(/[^a-z0-9]+/g, ' ');
}

async function fetchFreshSharedTripPayload(slug, { env = process.env, cookie = '' } = {}) {
  const token = clean(slug, 240);
  const bust = `_chatItinEdit=${Date.now()}`;
  const url = `${trekPublicBase(env)}/api/shared/${encodeURIComponent(token)}/?${bust}`;
  const headers = { accept: 'application/json' };
  if (cookie) headers.cookie = cookie;
  const upstream = await fetch(url, { method: 'GET', headers, cache: 'no-store' });
  if (!upstream.ok) {
    throw Object.assign(new Error(`shared_trip_fetch_failed ${upstream.status}`), { statusCode: upstream.status });
  }
  const json = await upstream.json();
  if (!json || !Array.isArray(json.places)) {
    throw new Error('shared_trip_payload_invalid');
  }
  return json;
}

export function resolvePlaceByQuery(payload, placeQuery) {
  const primary = normalizeItineraryPlaceQuery(placeQuery);
  const query = primary || normalizeName(placeQuery);
  if (!query) return { status: 'none', matches: [] };
  const places = Array.isArray(payload?.places) ? payload.places : [];
  const exact = places.filter((p) => normalizeName(p.name || p.title) === query);
  if (exact.length === 1) return { status: 'ok', place: exact[0], matches: exact };
  if (exact.length > 1) return { status: 'ambiguous', matches: exact };
  const partial = places.filter((p) => {
    const name = normalizeName(p.name || p.title);
    return name.includes(query) || query.includes(name);
  });
  if (partial.length === 1) return { status: 'ok', place: partial[0], matches: partial };
  if (partial.length > 1) return { status: 'ambiguous', matches: partial };
  return { status: 'none', matches: [] };
}

function placeLooksLikeBar(place, payload) {
  const id = place?.id;
  const key = `place:${id}`;
  const override = payload?.thingOverrides?.[key] || {};
  const haystack = [
    place?.name, place?.title, place?.category, override?.category, place?.description,
    override?.summary, override?.longDetails, override?.itineraryNote, place?.sourceRecord?.summary,
  ].filter(Boolean).join(' ');
  return BAR_SIGNAL.test(haystack);
}

function placeLatLng(place, payload) {
  const key = `place:${place.id}`;
  const override = payload?.thingOverrides?.[key] || {};
  const lat = Number(override.lat ?? place.lat ?? place.latitude);
  const lng = Number(override.lng ?? place.lng ?? place.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function coordDistance2(a, b) {
  const dx = a.lat - b.lat;
  const dy = a.lng - b.lng;
  return dx * dx + dy * dy;
}

function dayForNumber(payload, dayNumber) {
  const days = Array.isArray(payload?.days) ? payload.days : [];
  return days.find((d) => Number(d.day_number) === Number(dayNumber)) || null;
}

function placeOnDay(payload, placeId, dayId) {
  return placeAssignedOnDay(payload, placeId, dayId);
}

export function selectNearestBarBeforeAnchor(payload, anchorPlace, dayId) {
  const anchorCoords = placeLatLng(anchorPlace, payload);
  if (!anchorCoords) return null;
  const candidates = (payload.places || []).filter((p) => {
    if (String(p.id) === String(anchorPlace.id)) return false;
    if (!placeLooksLikeBar(p, payload)) return false;
    if (placeOnDay(payload, p.id, dayId)) return false;
    return placeLatLng(p, payload) != null;
  });
  if (!candidates.length) return null;
  candidates.sort((a, b) => coordDistance2(anchorCoords, placeLatLng(a, payload)) - coordDistance2(anchorCoords, placeLatLng(b, payload)));
  return candidates[0];
}

function deepCloneJson(value) {
  return structuredClone(value ?? {});
}

function overrideKey(placeId) {
  return `place:${placeId}`;
}

function ensurePlaceOverride(thingOverrides, placeId) {
  const key = overrideKey(placeId);
  if (!thingOverrides[key] || typeof thingOverrides[key] !== 'object') {
    thingOverrides[key] = {};
  }
  return thingOverrides[key];
}

function pruneScheduleDay(row, dayKey) {
  if (!row || typeof row !== 'object') return;
  if (Array.isArray(row.dayIds)) {
    row.dayIds = row.dayIds.map(String).filter((id) => id !== String(dayKey));
  }
  if (row.perDaySchedule && typeof row.perDaySchedule === 'object' && row.perDaySchedule[dayKey]) {
    const next = { ...row.perDaySchedule };
    delete next[dayKey];
    row.perDaySchedule = next;
  }
}

export function applySetTimeOp(payload, { placeId, dayId, timeHHMM, removeFromDayId = null }) {
  const before = {};
  const after = {};
  const thingOverrides = deepCloneJson(payload.thingOverrides || {});
  const key = overrideKey(placeId);
  before[key] = deepCloneJson(thingOverrides[key] || {});
  const row = ensurePlaceOverride(thingOverrides, placeId);
  const dayKey = String(dayId);
  if (removeFromDayId != null && String(removeFromDayId) !== dayKey) {
    pruneScheduleDay(row, String(removeFromDayId));
  }
  if (!Array.isArray(row.dayIds)) {
    const fromSchedule = row.perDaySchedule && typeof row.perDaySchedule === 'object'
      ? Object.keys(row.perDaySchedule)
      : [];
    row.dayIds = fromSchedule.length ? [...fromSchedule] : [];
  }
  if (!row.dayIds.map(String).includes(dayKey)) row.dayIds.push(dayId);
  row.timeline = true;
  if (!row.perDaySchedule || typeof row.perDaySchedule !== 'object') row.perDaySchedule = {};
  const prior = row.perDaySchedule[dayKey] && typeof row.perDaySchedule[dayKey] === 'object'
    ? { ...row.perDaySchedule[dayKey] }
    : {};
  row.perDaySchedule[dayKey] = { ...prior, startTime: timeHHMM };
  after[key] = deepCloneJson(row);
  return { thingOverrides, before, after, keys: [key] };
}

export function applyAddBarBeforeOp(payload, { barPlaceId, anchorPlaceId, dayId, anchorStartHHMM, barDurationMin = 60 }) {
  const anchorMin = minutesFromHHMM(anchorStartHHMM);
  if (anchorMin == null) throw new Error('anchor_time_invalid');
  const barStart = hhmmFromMinutes(anchorMin - Math.max(15, Number(barDurationMin) || 60));
  const setBar = applySetTimeOp(payload, { placeId: barPlaceId, dayId, timeHHMM: barStart });
  const thingOverrides = setBar.thingOverrides;
  const barKey = overrideKey(barPlaceId);
  const barRow = thingOverrides[barKey];
  const duration = String(Math.max(15, Number(barDurationMin) || 60));
  barRow.duration = barRow.duration || duration;
  if (barRow.perDaySchedule?.[String(dayId)]) {
    barRow.perDaySchedule[String(dayId)].duration = barRow.perDaySchedule[String(dayId)].duration || duration;
  }
  return {
    thingOverrides,
    before: setBar.before,
    after: { ...setBar.after, [barKey]: deepCloneJson(barRow) },
    keys: [barKey],
    anchorPlaceId,
    barStart,
  };
}

async function ensureChatItineraryEditsSchema(db) {
  await db`create table if not exists chat_itinerary_edits (
    id uuid primary key default gen_random_uuid(), trip_id uuid not null references trips(id) on delete cascade,
    share_slug text not null, turn_id uuid, touched_keys jsonb not null default '[]'::jsonb,
    before_json jsonb not null default '{}'::jsonb, after_json jsonb not null default '{}'::jsonb,
    anchor_place_id text, created_at timestamptz not null default now())`;
  await db`create table if not exists chat_itinerary_anchor_state (
    trip_id uuid primary key references trips(id) on delete cascade,
    anchor_place_id text, updated_at timestamptz not null default now())`;
}

async function loadAnchorPlaceId(db, tripId) {
  const rows = await db`select anchor_place_id from chat_itinerary_anchor_state where trip_id = ${tripId} limit 1`;
  return clean(rows[0]?.anchor_place_id, 80) || '';
}

async function saveAnchorPlaceId(db, tripId, placeId) {
  const id = clean(placeId, 80);
  if (!id) return;
  await db`insert into chat_itinerary_anchor_state (trip_id, anchor_place_id, updated_at) values (${tripId}, ${id}, now())
    on conflict (trip_id) do update set anchor_place_id = excluded.anchor_place_id, updated_at = now()`;
}

async function loadLatestEdit(db, tripId) {
  const rows = await db`select * from chat_itinerary_edits where trip_id = ${tripId} order by created_at desc limit 1`;
  return rows[0] || null;
}

export {
  placeAssignedOnDay,
  findPlaceAssignment,
  planPlaceOnDayAssignment,
  applyAssignmentMoveOnPayload,
  applyAssignmentCreateOnPayload,
} from './chat-itinerary-edit-assignment.mjs';

function editSkip(reason, replyContext = '', client = null) {
  return { applied: false, skipped: true, reason, client, replyContext };
}

function tripShareSlug(trip) {
  const meta = trip?.metadata && typeof trip.metadata === 'object' ? trip.metadata : {};
  const fromMeta = clean(meta.sharedToken || meta.shareToken || meta.publicSlug || meta.source_token || meta.slug, 240);
  if (fromMeta) return fromMeta;
  return clean(trip?.sharedToken || trip?.shareToken || trip?.share_token || trip?.publicSlug || trip?.source_token || trip?.slug, 240);
}

function itineraryEditReplyContext(result) {
  if (!result?.applied) return '';
  if (result.op === 'set_time') return `Itinerary edit: ${result.placeName} Day ${result.dayNumber} ${result.oldTime || 'unscheduled'} -> ${result.newTime}.`;
  if (result.op === 'add_bar_before') return `Itinerary edit: ${result.barName} before ${result.anchorName} Day ${result.dayNumber} ending by ${result.anchorTime}.`;
  if (result.op === 'undo') return 'Itinerary edit undone for the last chat schedule change.';
  return '';
}

async function persistItineraryWrite(db, trip, slug, turnId, placeId, applied, storedThingOverrides, webAccessToken, env, putOverrides) {
  const stored = storedThingOverrides && typeof storedThingOverrides === 'object' ? storedThingOverrides : {};
  const touchKeys = Array.isArray(applied.keys) ? applied.keys : [];
  const overrides = buildChatItineraryOverridesPutBody({
    before: applied.before,
    after: applied.after,
    keys: touchKeys,
    stored,
  });
  await putSharedTripOverrides({ slug, overrides, webAccessToken, env, putOverrides });
  dropSharedUpstreamCacheForSlug(clean(slug, 240));
  await db`insert into chat_itinerary_edits (trip_id, share_slug, turn_id, touched_keys, before_json, after_json, anchor_place_id)
    values (${trip.id}, ${slug}, ${turnId}, ${JSON.stringify(applied.keys)}, ${JSON.stringify(applied.before)}::jsonb, ${JSON.stringify(applied.after)}::jsonb, ${String(placeId)})`;
  await saveAnchorPlaceId(db, trip.id, placeId);
}

export async function runChatItineraryEditTurn({
  db, trip, customerTurn, turnId = null, httpReq = null, env = process.env,
  fetchPayload = fetchFreshSharedTripPayload, putOverrides = null, putAssignmentMove = null,
  postDayAssignment = null, extractIntent = extractItineraryEditIntent,
} = {}) {
  const slug = tripShareSlug(trip);
  if (!slug) return editSkip('no_share_slug');
  const guard = shareSlugEditGuardDecision(slug);
  if (!guard.ok) {
    const replyContext = guard.reason === 'not_allowlisted'
      ? 'Tell the customer itinerary editing is not enabled for this trip yet.'
      : guard.reason === 'demo_locked' ? '' : 'Tell the customer this demo trip cannot be edited via chat.';
    return editSkip(guard.reason, replyContext, { applied: false, reason: guard.reason });
  }
  const webAccessToken = readCookie(httpReq, webAccessCookieName())
    || clean(httpReq?.headers?.['x-timesyncher-web-access-token'], 400) || '';
  if (!webAccessToken) {
    return editSkip('web_edit_access_required', 'The customer needs website edit access before chat can change the itinerary.', { applied: false, reason: 'web_edit_access_required' });
  }
  try {
    await requireWebEditAccess(db, httpReq || { headers: { cookie: `${webAccessCookieName()}=${webAccessToken}` } }, { tripId: trip.id, env });
  } catch {
    return editSkip('web_edit_denied', 'Website edit access is required to change the itinerary from chat.', { applied: false, reason: 'web_edit_denied' });
  }
  await ensureChatItineraryEditsSchema(db);
  const offlineIntent = offlineParseItineraryEditIntent(customerTurn);
  const intentRaw = await extractIntent({ customerTurn, env });
  const intent = coalesceChatItineraryEditIntent(
    intentRaw && typeof intentRaw === 'object' ? intentRaw : { op: 'none' },
    offlineIntent,
  );
  if (!intent || intent.op === 'none') return editSkip('no_intent');
  let payload = await fetchPayload(slug, { env, cookie: `${webAccessCookieName()}=${encodeURIComponent(webAccessToken)}` });
  if (intent.op === 'undo') {
    const latest = await loadLatestEdit(db, trip.id);
    if (!latest) {
      return editSkip('nothing_to_undo', 'There is no recent chat itinerary edit to undo.', { applied: false, reason: 'nothing_to_undo' });
    }
    const before = latest.before_json && typeof latest.before_json === 'object' ? latest.before_json : {};
    const undoKeys = Object.keys(before);
    const overrides = buildChatItineraryOverridesPutBody({
      before, after: {}, keys: undoKeys, stored: payload.thingOverrides || {},
    });
    await putSharedTripOverrides({ slug, overrides, webAccessToken, env, putOverrides });
    dropSharedUpstreamCacheForSlug(clean(slug, 240));
    return { applied: true, op: 'undo', client: { applied: true, op: 'undo' }, replyContext: itineraryEditReplyContext({ applied: true, op: 'undo' }) };
  }
  let place = null;
  if (intent.placeQuery) {
    const resolved = resolvePlaceByQuery(payload, intent.placeQuery);
    if (resolved.status === 'ambiguous') {
      const names = resolved.matches.map((p) => p.name || p.title).filter(Boolean).slice(0, 6);
      return editSkip('ambiguous_place', `Ask which place they mean. Real options: ${names.join('; ')}.`, { applied: false, reason: 'ambiguous_place', candidates: names });
    }
    if (resolved.status === 'ok') place = resolved.place;
  }
  if (!place && intent.op !== 'undo') {
    const retry = offlineParseItineraryEditIntent(customerTurn);
    if (retry.placeQuery && retry.placeQuery !== intent.placeQuery) {
      const resolved = resolvePlaceByQuery(payload, retry.placeQuery);
      if (resolved.status === 'ok') {
        place = resolved.place;
        if (!intent.dayNumber && retry.dayNumber) intent.dayNumber = retry.dayNumber;
        if (!intent.time && retry.time) intent.time = retry.time;
      }
    }
  }
  if (!place && intent.op === 'add_bar_before') {
    const anchorId = await loadAnchorPlaceId(db, trip.id);
    if (anchorId) place = (payload.places || []).find((p) => String(p.id) === String(anchorId)) || null;
  }
  if (!place) return editSkip('place_not_found', 'Ask which itinerary place they want to change, using names from the trip.', { applied: false, reason: 'place_not_found' });
  const storedAnchorId = intent.op === 'add_bar_before' ? (await loadAnchorPlaceId(db, trip.id)) : '';
  const dayResolve = resolveItineraryEditDayNumber({
    payload,
    place,
    intent,
    customerTurn,
    anchorPlaceId: storedAnchorId || place.id,
  });
  const dayNumber = dayResolve.dayNumber;
  if (!dayNumber) {
    const skip = dayEditSkipLabels(payload, place, dayResolve);
    return editSkip(skip.reason, skip.reply, { applied: false, reason: skip.reason, candidates: skip.candidates });
  }
  const day = dayForNumber(payload, dayNumber);
  if (!day) {
    return editSkip('day_not_found', 'Ask which day number on this trip they mean.', { applied: false, reason: 'day_not_found' });
  }
  if (intent.op === 'set_time') {
    const timeHHMM = parseTimeToHHMM(intent.time);
    if (!timeHHMM) return editSkip('time_invalid', 'Ask what time they want, like 8:30 PM.', { applied: false, reason: 'time_invalid' });
    const key = overrideKey(place.id);
    const oldTime = payload?.thingOverrides?.[key]?.perDaySchedule?.[String(day.id)]?.startTime
      || payload?.thingOverrides?.[key]?.startTime || place.place_time || '';
    const priorAssignment = findPlaceAssignment(payload, place.id);
    const removeFromDayId = priorAssignment && String(priorAssignment.dayId) !== String(day.id)
      ? priorAssignment.dayId
      : null;
    if (!placeAssignedOnDay(payload, place.id, day.id)) {
      const assignment = await ensurePlaceAssignedOnDay({
        payload, slug, placeId: place.id, dayId: day.id, webAccessToken, env, putAssignmentMove, postDayAssignment,
      });
      if (!assignment.ok) {
        const assignedDays = assignedDayNumbersForPlace(payload, place.id);
        const onDay = priorAssignment
          ? (assignedDays.length ? `Day ${assignedDays.join(', ')}` : `day ${priorAssignment.dayId}`)
          : 'this trip';
        return editSkip(
          'assignment_move_failed',
          `${place.name || place.title} could not be moved onto Day ${dayNumber}; it is still scheduled on ${onDay}.`,
          { applied: false, reason: 'assignment_move_failed' },
        );
      }
      payload = assignment.payload;
    }
    if (!placeAssignedOnDay(payload, place.id, day.id)) {
      return editSkip(
        'assignment_move_failed',
        `${place.name || place.title} is not on Day ${dayNumber} yet; try again after refreshing the trip.`,
        { applied: false, reason: 'assignment_move_failed' },
      );
    }
    const applied = applySetTimeOp(payload, {
      placeId: place.id,
      dayId: day.id,
      timeHHMM,
      removeFromDayId,
    });
    await persistItineraryWrite(db, trip, slug, turnId, place.id, applied, payload.thingOverrides, webAccessToken, env, putOverrides);
    const result = {
      applied: true,
      op: 'set_time',
      placeName: place.name || place.title,
      dayNumber,
      dayTitle: clean(day.title, 120),
      oldTime: clean(oldTime, 40),
      newTime: timeHHMM,
      client: { applied: true },
    };
    return { ...result, replyContext: itineraryEditReplyContext(result) };
  }
  if (intent.op === 'add_bar_before') {
    const anchorKey = overrideKey(place.id);
    const anchorSchedule = payload?.thingOverrides?.[anchorKey]?.perDaySchedule?.[String(day.id)] || payload?.thingOverrides?.[anchorKey];
    const anchorTime = parseTimeToHHMM(anchorSchedule?.startTime || anchorSchedule?.time || place.place_time || '');
    if (!anchorTime) return editSkip('anchor_time_missing', `Set a time for ${place.name || place.title} on that day before adding a bar before it.`, { applied: false, reason: 'anchor_time_missing' });
    const bar = selectNearestBarBeforeAnchor(payload, place, day.id);
    if (!bar) return editSkip('no_bar_candidate', 'No unused bar already on this trip is available to schedule before that dinner.', { applied: false, reason: 'no_bar_candidate' });
    const barAssignment = await ensurePlaceAssignedOnDay({
      payload, slug, placeId: bar.id, dayId: day.id, webAccessToken, env, putAssignmentMove, postDayAssignment,
    });
    if (!barAssignment.ok) {
      return editSkip(
        'assignment_move_failed',
        `${bar.name || bar.title} could not be scheduled on Day ${dayNumber} before ${place.name || place.title}.`,
        { applied: false, reason: 'assignment_move_failed' },
      );
    }
    payload = barAssignment.payload;
    const duration = Number(payload?.thingOverrides?.[overrideKey(bar.id)]?.duration) || 60;
    const applied = applyAddBarBeforeOp(payload, { barPlaceId: bar.id, anchorPlaceId: place.id, dayId: day.id, anchorStartHHMM: anchorTime, barDurationMin: duration });
    await persistItineraryWrite(db, trip, slug, turnId, place.id, applied, payload.thingOverrides, webAccessToken, env, putOverrides);
    const result = { applied: true, op: 'add_bar_before', barName: bar.name || bar.title, anchorName: place.name || place.title, dayNumber, anchorTime, barStart: applied.barStart, client: { applied: true } };
    return { ...result, replyContext: itineraryEditReplyContext(result) };
  }
  return editSkip('unsupported_op');
}

export async function prepareChatItineraryEditForQueueTurn({ db, trip, seat, tripId, requestText, turnId, httpReq, env }) {
  if (!tripId || !trip || seat) {
    return { replyCustomerTurn: requestText, itineraryEditResult: null, itineraryEditAuthoritative: '', itineraryEditCannedReply: '' };
  }
  try {
    const itineraryEditResult = await runChatItineraryEditTurn({ db, trip, customerTurn: requestText, turnId, httpReq, env });
    let replyCustomerTurn = requestText;
    let itineraryEditAuthoritative = '';
    let itineraryEditCannedReply = '';
    if (itineraryEditResult?.applied) {
      const slug = tripShareSlug(trip);
      let freshPayload = null;
      try {
        const webAccessToken = readCookie(httpReq, webAccessCookieName())
          || clean(httpReq?.headers?.['x-timesyncher-web-access-token'], 400) || '';
        if (slug && webAccessToken) {
          freshPayload = await fetchFreshSharedTripPayload(slug, { env, cookie: `${webAccessCookieName()}=${encodeURIComponent(webAccessToken)}` });
        }
      } catch (freshError) {
        console.error('chat_itinerary_edit_fresh_payload', String(freshError?.message || freshError));
      }
      itineraryEditAuthoritative = buildItineraryEditAuthoritativeSystemExtra(itineraryEditResult, freshPayload);
    } else if (itineraryEditResult?.reason === 'demo_locked') {
      itineraryEditCannedReply = DEMO_LOCKED_CHAT_EDIT_CUSTOMER_REPLY;
    } else if (itineraryEditResult?.replyContext) {
      replyCustomerTurn = `${requestText}\n\n${itineraryEditResult.replyContext}`;
    }
    return { replyCustomerTurn, itineraryEditResult, itineraryEditAuthoritative, itineraryEditCannedReply };
  } catch (error) {
    const message = String(error?.message || error);
    const statusCode = error?.statusCode;
    console.error('chat_itinerary_edit_failed', message, statusCode != null && statusCode !== '' ? `status=${statusCode}` : '');
    const itineraryEditAuthoritative = buildItineraryEditFailureAuthoritativeSystemExtra('edit_failed');
    return {
      replyCustomerTurn: itineraryEditAuthoritative ? `${requestText}\n\n${itineraryEditAuthoritative}` : requestText,
      itineraryEditResult: editSkip(message, 'The itinerary change did not save. Ask the customer to try again in a moment.', { applied: false, reason: 'edit_failed' }),
      itineraryEditAuthoritative,
      itineraryEditCannedReply: '',
    };
  }
}
