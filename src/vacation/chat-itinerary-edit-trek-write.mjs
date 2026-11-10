import { webAccessCookieName } from './web-access.mjs';
import { shareSlugEditGuardDecision } from './chat-itinerary-edit-slug-guard.mjs';
import {
  applyAssignmentCreateOnPayload,
  applyAssignmentMoveOnPayload,
  planPlaceOnDayAssignment,
} from './chat-itinerary-edit-assignment.mjs';

function clean(value, max = 500) {
  return String(value ?? '').trim().slice(0, max);
}

export function trekPublicBase(env = process.env) {
  const base = clean(env.TIMESYNCHER_TREK_PUBLIC_BASE_URL || env.TIMESYNCHER_PUBLIC_BASE_URL, 400).replace(/\/+$/, '');
  if (!base) throw Object.assign(new Error('TIMESYNCHER_TREK_PUBLIC_BASE_URL is missing'), { code: 'trek_upstream_unconfigured' });
  return base;
}

async function trekSharedEditFetch({ slug, method, path, body, webAccessToken, env = process.env }) {
  const guard = shareSlugEditGuardDecision(slug);
  if (!guard.ok) throw Object.assign(new Error(guard.reason), { statusCode: 403 });
  const sessionToken = clean(webAccessToken, 400);
  if (!sessionToken) throw Object.assign(new Error('web_edit_access_required'), { statusCode: 403 });
  const base = trekPublicBase(env);
  const res = await fetch(`${base}${path.startsWith('/') ? path : `/${path}`}`, {
    method,
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      cookie: `${webAccessCookieName()}=${encodeURIComponent(sessionToken)}`,
    },
    body: body != null ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw Object.assign(new Error(`trek_edit_write_failed ${res.status} ${text.slice(0, 200)}`), { statusCode: res.status });
  }
}

export async function putSharedTripOverrides({ slug, overrides, webAccessToken, env = process.env, putOverrides = null }) {
  const guard = shareSlugEditGuardDecision(slug);
  if (!guard.ok) throw Object.assign(new Error(guard.reason), { statusCode: 403 });
  if (putOverrides) return await putOverrides({ slug, overrides, webAccessToken, env });
  const token = clean(slug, 240);
  await trekSharedEditFetch({
    slug,
    method: 'PUT',
    path: `/api/shared/${encodeURIComponent(token)}/overrides`,
    body: { overrides },
    webAccessToken,
    env,
  });
}

async function putSharedTripAssignmentMove({
  slug, tripId, assignmentId, newDayId, orderIndex = null, webAccessToken, env = process.env, putAssignmentMove = null,
}) {
  const guard = shareSlugEditGuardDecision(slug);
  if (!guard.ok) throw Object.assign(new Error(guard.reason), { statusCode: 403 });
  const body = { new_day_id: Number(newDayId) };
  if (orderIndex != null && Number.isFinite(Number(orderIndex))) body.order_index = Number(orderIndex);
  if (putAssignmentMove) {
    return await putAssignmentMove({ slug, tripId, assignmentId, newDayId, orderIndex, body, webAccessToken, env });
  }
  await trekSharedEditFetch({
    slug,
    method: 'PUT',
    path: `/api/trips/${encodeURIComponent(String(tripId))}/assignments/${encodeURIComponent(String(assignmentId))}/move`,
    body,
    webAccessToken,
    env,
  });
}

async function postSharedTripDayAssignment({
  slug, tripId, dayId, placeId, orderIndex = null, webAccessToken, env = process.env, postDayAssignment = null,
}) {
  const guard = shareSlugEditGuardDecision(slug);
  if (!guard.ok) throw Object.assign(new Error(guard.reason), { statusCode: 403 });
  const body = { place_id: Number(placeId) };
  if (orderIndex != null && Number.isFinite(Number(orderIndex))) body.order_index = Number(orderIndex);
  if (postDayAssignment) {
    return await postDayAssignment({ slug, tripId, dayId, placeId, orderIndex, body, webAccessToken, env });
  }
  await trekSharedEditFetch({
    slug,
    method: 'POST',
    path: `/api/trips/${encodeURIComponent(String(tripId))}/days/${encodeURIComponent(String(dayId))}/assignments`,
    body,
    webAccessToken,
    env,
  });
}

export async function ensurePlaceAssignedOnDay({
  payload, slug, placeId, dayId, webAccessToken, env = process.env, putAssignmentMove = null, postDayAssignment = null,
} = {}) {
  const plan = planPlaceOnDayAssignment(payload, { placeId, dayId });
  if (plan.kind === 'already_on_day') return { ok: true, plan, payload };
  const tripId = payload?.trip?.id;
  if (!tripId) return { ok: false, reason: 'trip_id_missing', plan };
  if (plan.kind === 'move') {
    if (plan.assignmentId == null) return { ok: false, reason: 'assignment_id_missing', plan };
    await putSharedTripAssignmentMove({
      slug, tripId, assignmentId: plan.assignmentId, newDayId: plan.toDayId, webAccessToken, env, putAssignmentMove,
    });
    return {
      ok: true,
      plan,
      payload: applyAssignmentMoveOnPayload(payload, {
        placeId,
        fromDayId: plan.fromDayId,
        toDayId: plan.toDayId,
        assignmentId: plan.assignmentId,
      }),
    };
  }
  if (plan.kind === 'create') {
    await postSharedTripDayAssignment({
      slug, tripId, dayId: plan.toDayId, placeId: plan.placeId, webAccessToken, env, postDayAssignment,
    });
    return {
      ok: true,
      plan,
      payload: applyAssignmentCreateOnPayload(payload, { placeId: plan.placeId, dayId: plan.toDayId }),
    };
  }
  return { ok: false, reason: 'assignment_plan_unknown', plan };
}
