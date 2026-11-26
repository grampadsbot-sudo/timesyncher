import { DatabaseJsonStore, LocalJsonStore } from '../onboarding/eula-persistent-store.mjs';
import { hasDatabase, sql } from './db.mjs';
import { intakeShareSlug } from './intake-shared-trip.mjs';
import { vacationAppTurnPayloadForClient } from './reply-ship.mjs';
import { listVkAdminGroups, presentVkAdminVacation } from './vk-admin-fixtures.mjs';

export function vkAdminStorage(env) {
  if (hasDatabase(env)) return new DatabaseJsonStore({ prefix: 'vk-admin-review', env });
  if (env.VERCEL || env.VERCEL_ENV) throw new Error('VK admin storage requires a vacation database');
  return new LocalJsonStore('runtime/vk-admin-review');
}

const iso = (value) => value ? new Date(value).toISOString() : null;

function groupByKey(items, keyFn) {
  const map = new Map();
  for (const item of items) {
    const key = keyFn(item);
    const bucket = map.get(key);
    if (bucket) bucket.push(item);
    else map.set(key, [item]);
  }
  return map;
}

function storedGroup(row) {
  const label = row.display_name || [row.first_name, row.last_name].filter(Boolean).join(' ') || row.title;
  return {
    tripId: row.trip_id, sortAt: iso(row.created_at),
    label, destination: row.destination || '', customerCount: row.customer_id ? 1 : 0,
    customers: row.customer_id ? [{ id: row.customer_id, customer_label: label }] : [],
    isTest: Boolean(row.harness_tag),
  };
}

export async function vkAdminGroups(db) {
  const fixtures = listVkAdminGroups();
  if (!db) return fixtures;
  const rows = await db`
    select t.id::text as trip_id, t.title, t.destination, t.created_at,
      c.id as customer_id, c.display_name, c.first_name, c.last_name, t.metadata->>'harnessTag' as harness_tag
    from trips t left join customers c on c.id = t.customer_id
    order by t.created_at desc, t.id
  `;
  return [...rows.map(storedGroup), ...fixtures].sort((a, b) => Date.parse(b.sortAt) - Date.parse(a.sortAt));
}

function costs(rows) {
  const total = { actual: 0, estimated: 0, unpriced: 0 };
  for (const row of rows) {
    const amount = row.costUsd == null || row.costUsd === '' ? NaN : Number(row.costUsd);
    if (Number.isFinite(amount) && row.costSource === 'openrouter_usage_cost') total.actual += Math.round(amount * 1e8);
    else if (Number.isFinite(amount) && row.costSource === 'openrouter_listed_price') total.estimated += Math.round(amount * 1e8);
    else total.unpriced += 1;
  }
  return { actual: total.actual / 1e8, estimated: total.estimated / 1e8, unpriced: total.unpriced };
}

function dialog(vacation, ledger) {
  const rows = ledger.filter((row) => String(row?.tripId ?? '') === vacation.tripId);
  const byRequest = groupByKey(rows.filter((row) => row.requestId != null), (row) => String(row.requestId));
  return {
    ...vacation,
    costs: costs(rows),
    replyDetails: vacation.turns.map((turn) => {
      if (turn.speaker !== 'app' && turn.direction !== 'outbound' && turn.speaker !== 'assistant') return null;
      const callRows = byRequest.get(String(turn.requestId)) || turn.payload?.liveTranscript?.openrouterCalls || [];
      const generation = callRows.filter((row) =>
        row.tripId === vacation.tripId && row.ok !== false
        && (!row.purpose || row.purpose === turn.generationPurpose)
        && (!turn.model || row.model === turn.model));
      const call = generation.at(-1);
      const cost = costs(call ? [call] : []);
      return { model: call?.model || turn.model || '', costs: cost, priced: Boolean(call && !cost.unpriced) };
    }),
  };
}

function storedTurn(row, label) {
  const payload = vacationAppTurnPayloadForClient(row.payload || {});
  const live = row.payload?.liveTranscript || {};
  return {
    speaker: row.speaker, direction: row.direction, body: row.body,
    at: iso(row.at), requestId: row.request_id, payload,
    authorLabel: payload.authorName || live.speakerName || (row.direction === 'inbound' ? label : 'Vacay Keepsake'),
    model: live.shippedModel || live.model?.responseModel || live.modelId || '',
    generationPurpose: live.held ? 'reply_interim' : live.quality?.rewritten ? 'reply_rewrite' : 'reply_draft',
  };
}

export async function findVkAdminVacation(db, id, { detail = false } = {}) {
  const fixture = presentVkAdminVacation(id);
  if (fixture) return detail ? dialog(fixture, fixture.ledger || []) : fixture;
  if (!db || !/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(id)) return null;
  const [row] = await db`
    select t.id::text as trip_id, t.title, t.destination, t.created_at,
      c.id as customer_id, c.display_name, c.first_name, c.last_name,
      t.metadata->>'harnessTag' as harness_tag,
      coalesce(t.metadata->>'sharedToken', t.metadata->>'shareToken', t.metadata->>'publicSlug',
        t.metadata->>'source_token', t.metadata->>'slug') as share_slug,
      t.metadata->'qa' as qa, t.metadata->'survey' as survey, t.metadata->>'intakeShare' = 'true' as intake_share
    from trips t left join customers c on c.id = t.customer_id
    where t.id = ${id}
  `;
  if (!row) return null;
  const group = storedGroup(row);
  if (!detail) return group;
  const [transcript, sessions, events] = await Promise.all([
    db`
      select request_id, speaker, direction, body, payload, coalesce(received_at, sent_at, created_at) as at
      from transcript_turns where trip_id = ${id}
      and channel in ('vacation-app', 'vacation_app', 'telegram_vacation_bot', 'telegram_vacation_media')
      order by coalesce(received_at, sent_at, created_at), created_at, id
    `,
    db`
      select id, status, current_step, created_at, email_sent_at, started_at, completed_at
      from onboarding_sessions where trip_id = ${id} order by created_at, id
    `,
    db`
      select oc.session_id, oc.event_type, oc.target, oc.clicked_at
      from onboarding_clicks oc join onboarding_sessions os on os.id = oc.session_id
      where os.trip_id = ${id} order by oc.clicked_at, oc.id
    `,
  ]);
  const seenLedgers = new Map();
  for (const turn of transcript) {
    const rows = turn.payload?.liveTranscript?.openrouterCalls;
    if (!Array.isArray(rows) || !rows.length) continue;
    const request = turn.request_id;
    const calls = rows.map((call) => ({ ...call, requestId: call.requestId ?? request }));
    const prior = request && seenLedgers.get(request);
    if (!prior || prior.length < calls.length) seenLedgers.set(request || turn, calls);
  }
  const onboarding = sessions.map((session) => ({
    status: session.status, currentStep: session.current_step,
    events: [
      { label: 'Session created', at: iso(session.created_at) },
      { label: 'Purchase email sent', at: iso(session.email_sent_at) },
      { label: 'Onboarding started', at: iso(session.started_at) },
      ...events.filter((event) => event.session_id === session.id).map((event) => ({
        label: [event.event_type, event.target].filter(Boolean).join(' · '), at: iso(event.clicked_at),
      })),
      { label: 'Onboarding completed', at: iso(session.completed_at) },
    ].filter((event) => event.at).sort((a, b) => a.at.localeCompare(b.at)),
  }));
  return dialog({
    ...group, shareSlug: row.share_slug || (row.intake_share ? intakeShareSlug(id) : ''),
    turns: transcript.map((turn) => storedTurn(turn, group.label)),
    onboarding, qa: row.qa, survey: row.survey,
  }, [...seenLedgers.values()].flat());
}

export function vkAdminDatabase(env) {
  return hasDatabase(env) ? sql(env) : null;
}
