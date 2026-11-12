import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { webAccessCookieName, webAccessTokenHash } from '../src/vacation/web-access.mjs';
import { offlineParseItineraryEditIntent, runChatItineraryEditTurn } from '../src/vacation/chat-itinerary-edit.mjs';
import {
  applyAssignmentCreateOnPayload,
  applyAssignmentMoveOnPayload,
} from '../src/vacation/chat-itinerary-edit-assignment.mjs';

function mergeSharedOverrides(thingOverrides, patch) {
  for (const [key, value] of Object.entries(patch)) {
    if (!value || typeof value !== 'object' || !Object.keys(value).length) {
      delete thingOverrides[key];
      continue;
    }
    const prior = { ...(thingOverrides[key] || {}) };
    thingOverrides[key] = { ...prior, ...value };
    if (value.perDaySchedule && typeof value.perDaySchedule === 'object') {
      thingOverrides[key].perDaySchedule = { ...(prior.perDaySchedule || {}), ...value.perDaySchedule };
    }
  }
}

export async function createChatEditCopyAcceptance({ checkout, fixtureDir, cfg, env }) {
  const sharedPath = path.join(fixtureDir, cfg.copy_shared_file || 'chat-edit-copy-shared.json');
  const copyStored = JSON.parse(await readFile(sharedPath, 'utf8'));
  const slug = cfg.copy_shared_token;
  const throwawayTripId = cfg.throwaway_trip_id;
  const session = 'acceptance-copy-session';
  const copyEditEnv = { ...env, TIMESYNCHER_WEB_ACCESS_TOKEN_SALT: env.TIMESYNCHER_WEB_ACCESS_TOKEN_SALT || 'acceptance-fixture-salt', CHAT_ITINERARY_EDIT_OFFLINE_PARSE: '1' };
  const sessionHash = webAccessTokenHash(session, copyEditEnv);
  const copyDb = async (parts, ...values) => {
    const sql = parts.join('?').replace(/\s+/g, ' ').trim();
    if (/^(create|alter) /i.test(sql)) return [];
    if (/from vacation_web_access_grants/i.test(sql) && /session_token_hash/.test(sql)) {
      if (values.includes(sessionHash)) {
        return [{
          id: 'grant-copy',
          trip_id: throwawayTripId,
          role: 'owner',
          owner_customer_id: 'acceptance-owner',
          status: 'accepted',
        }];
      }
      return [];
    }
    if (/from trips/i.test(sql) && /customer_id/.test(sql)) return [{ customer_id: 'acceptance-owner' }];
    if (/update vacation_web_access_grants/i.test(sql)) return [];
    if (/insert into chat_itinerary_edits/i.test(sql)) return [];
    if (/insert into chat_itinerary_anchor_state/i.test(sql)) return [];
    if (/anchor_place_id from chat_itinerary_anchor_state/i.test(sql)) {
      const carbone = (copyStored.places || []).find((p) => /carbone/i.test(p.name || ''));
      return [{ anchor_place_id: carbone ? String(carbone.id) : null }];
    }
    if (/from chat_itinerary_edits/i.test(sql)) return [];
    throw new Error(`acceptance copy chat db: ${sql.slice(0, 120)}`);
  };

  const runCopyTurn = async (customerTurn) => runChatItineraryEditTurn({
    db: copyDb,
    trip: { id: throwawayTripId, metadata: { sharedToken: slug, throwaway: true } },
    customerTurn,
    httpReq: { headers: { cookie: `${webAccessCookieName()}=${encodeURIComponent(session)}` } },
    env: copyEditEnv,
    extractIntent: offlineParseItineraryEditIntent,
    fetchPayload: async () => structuredClone(copyStored),
    putOverrides: async ({ overrides }) => {
      mergeSharedOverrides(copyStored.thingOverrides, overrides);
    },
    putAssignmentMove: async ({ newDayId }) => {
      const carbone = copyStored.places.find((p) => /carbone/i.test(p.name || ''));
      const fromDay = copyStored.days.find((d) => copyStored.assignments[String(d.id)]?.some((a) => a.place_id === carbone?.id));
      const assignment = fromDay && copyStored.assignments[String(fromDay.id)]?.find((a) => a.place_id === carbone?.id);
      if (carbone && fromDay && assignment) {
        Object.assign(copyStored, applyAssignmentMoveOnPayload(copyStored, {
          placeId: carbone.id,
          fromDayId: fromDay.id,
          toDayId: newDayId,
          assignmentId: assignment.id,
        }));
      }
    },
    postDayAssignment: async ({ dayId, placeId }) => {
      Object.assign(copyStored, applyAssignmentCreateOnPayload(copyStored, { placeId, dayId }));
    },
  });

  return {
    slug,
    throwawayTripId,
    setOrigin(origin) {
      copyEditEnv.TIMESYNCHER_TREK_PUBLIC_BASE_URL = origin;
      copyEditEnv.TIMESYNCHER_PUBLIC_BASE_URL = origin;
      copyEditEnv.TIMESYNCHER_SITE_BASE_URL = origin;
    },
    getCopyPayload: () => copyStored,
    patchOwnerRows(rows, origin) {
      return rows.map((row) => {
        if (row.id !== throwawayTripId) return row;
        const meta = { ...(row.metadata || {}) };
        meta.publicUrl = `${origin}/shared/${slug}/`;
        meta.public_url = meta.publicUrl;
        meta.webItineraryUrl = meta.publicUrl;
        meta.sharedToken = slug;
        meta.shareToken = slug;
        return { ...row, metadata: meta };
      });
    },
    async handleVacationItineraryPost(body, httpReq = null) {
      if (body?.action === 'finish-rewrite') {
        return { ok: true, reply: 'Done.', status: 'complete' };
      }
      const tripId = body?.tripId;
      const text = String(body?.text || '').trim();
      if (!text) {
        return { ok: false, error: 'acceptance_copy_chat_text_required' };
      }
      const result = await runCopyTurn(text);
      if (result?.reason === 'demo_locked') {
        return {
          ok: true,
          reply: 'This demo trip is locked for chat edits. You can change it on the trip site.',
          itineraryEdit: { applied: false, reason: 'demo_locked' },
        };
      }
      if (!result?.applied) {
        return {
          ok: true,
          reply: result?.replyContext || 'The itinerary change did not save.',
          itineraryEdit: { applied: false, reason: result?.reason || 'edit_failed' },
        };
      }
      const place = result.placeName || 'the place';
      const reply = result.op === 'add_bar_before'
        ? `Added a bar stop before ${place} on day ${result.dayNumber}.`
        : `Updated ${place} on day ${result.dayNumber}${result.newTime ? ` to ${result.newTime}` : ''}.`;
      return {
        ok: true,
        reply,
        status: 'complete',
        itineraryEdit: {
          applied: true,
          op: result.op,
          placeName: result.placeName,
          dayNumber: result.dayNumber,
          newTime: result.newTime,
        },
      };
    },
    matchTrekPath(pathname, method) {
      const prefix = `/api/shared/${slug}`;
      if ((pathname === `${prefix}` || pathname === `${prefix}/`) && method === 'GET') return 'get';
      if (pathname === `${prefix}/overrides`) return 'put-overrides';
      if (/^\/api\/shared\/[^/]+\/assignments\/[^/]+\/move$/.test(pathname) && pathname.startsWith(prefix)) return 'put-move';
      if (/^\/api\/shared\/[^/]+\/days\/[^/]+\/assignments$/.test(pathname) && pathname.startsWith(prefix)) return 'post-assignment';
      return null;
    },
    async handleTrek(req, pathname, readJsonBody) {
      const kind = this.matchTrekPath(pathname, req.method || 'GET');
      if (kind === 'get') return { status: 200, body: copyStored };
      if (kind === 'put-overrides') {
        const body = await readJsonBody(req);
        mergeSharedOverrides(copyStored.thingOverrides, body?.overrides || {});
        return { status: 200, body: { ok: true } };
      }
      if (kind === 'put-move') {
        const parts = pathname.split('/');
        const assignmentId = Number(parts[parts.length - 2]);
        const body = await readJsonBody(req);
        const newDayId = Number(body?.new_day_id);
        const carbone = copyStored.places.find((p) => /carbone/i.test(p.name || ''));
        const fromDay = copyStored.days.find((d) => copyStored.assignments[String(d.id)]?.some((a) => a.place_id === carbone?.id));
        if (carbone && fromDay && Number.isFinite(newDayId)) {
          Object.assign(copyStored, applyAssignmentMoveOnPayload(copyStored, {
            placeId: carbone.id,
            fromDayId: fromDay.id,
            toDayId: newDayId,
            assignmentId,
          }));
        }
        return { status: 200, body: { ok: true } };
      }
      if (kind === 'post-assignment') {
        const dayId = Number(pathname.split('/').slice(-2, -1)[0]);
        const body = await readJsonBody(req);
        const placeId = Number(body?.place_id);
        if (Number.isFinite(dayId) && Number.isFinite(placeId)) {
          Object.assign(copyStored, applyAssignmentCreateOnPayload(copyStored, { placeId, dayId }));
        }
        return { status: 200, body: { ok: true } };
      }
      return null;
    },
  };
}
