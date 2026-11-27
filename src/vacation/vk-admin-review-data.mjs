import { hasDatabase, sql } from './db.mjs';
import { intakeShareSlug } from './intake-shared-trip.mjs';
import { vacationAppTurnPayloadForClient } from './reply-ship.mjs';
import { tripStateCapabilities } from './trip-state-action-registry.mjs';
import { tripStateBacking, tripStateSiteLocked } from './trip-state-action-site.mjs';
import { listVkAdminGroups, presentVkAdminVacation, vkAdminFixtureTrip, vkAdminRosterId } from './vk-admin-fixtures.mjs';

const iso = (value) => value ? new Date(value).toISOString() : null;
const date = (value) => iso(value)?.slice(0, 10) || '';

export const VK_ADMIN_TEST_DOMAINS = Object.freeze([
  'agentmail.to', 'example.com', 'example.test', 'example.invalid',
  'harness.invalid', 'resend.dev', 'timesyncher.test', 'test.com',
]);
const testDomainSuffixes = ['.invalid', '.test', '.local', '.example'];

export function classifyVkAdminGroup({ customerId, email, rosterId, harnessTag }, { fixture = false } = {}) {
  const domain = email?.trim().split('@')[1]?.toLowerCase();
  let testReason = null;
  if (fixture) testReason = 'fixture';
  else if (harnessTag) testReason = 'harness';
  else if (!customerId) testReason = 'no-owner';
  else if (rosterId != null) testReason = 'fixture';
  else if (!domain) testReason = 'no-email';
  else if (VK_ADMIN_TEST_DOMAINS.includes(domain) || testDomainSuffixes.some((suffix) => domain.endsWith(suffix))) testReason = 'test-domain';
  const isTest = testReason !== null;
  return { isTest, testReason, visibleByDefault: !isTest, testTag: isTest ? 'Test' : null };
}

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
  const rosterId = vkAdminRosterId(row.customer_email);
  const harnessTag = row.harness_tag || '';
  const member = rosterId != null
    ? { id: rosterId, customer_label: label, recordId: row.customer_id }
    : { id: row.customer_id, customer_label: label };
  return {
    tripId: row.trip_id, sortAt: iso(row.created_at), title: row.title,
    label, destination: row.destination || '', customerCount: row.customer_id ? 1 : 0,
    customers: row.customer_id ? [member] : [],
    harnessTag,
    ...classifyVkAdminGroup({ customerId: row.customer_id, email: row.customer_email, rosterId, harnessTag }),
  };
}

const fixtureVisibility = classifyVkAdminGroup({}, { fixture: true });

export async function vkAdminGroups(db) {
  const fixtures = listVkAdminGroups().map((group) => ({ ...group, ...fixtureVisibility }));
  if (!db) return fixtures;
  const rows = await db`
    select t.id::text as trip_id, t.title, t.destination, t.created_at,
      c.id as customer_id, c.email as customer_email, c.display_name, c.first_name, c.last_name,
      t.metadata->>'harnessTag' as harness_tag
    from trips t left join customers c on c.id = t.customer_id
    order by t.created_at desc, t.id
  `;
  const groups = [...rows.map(storedGroup), ...fixtures].sort((a, b) =>
    (Date.parse(b.sortAt) || 0) - (Date.parse(a.sortAt) || 0));
  const harnessStories = new Set();
  for (const group of groups) {
    const story = /^harness:[^:\s]+:([^:\s]+)$/.exec(group.harnessTag)?.[1];
    if (!story || harnessStories.has(story)) continue;
    harnessStories.add(story);
    group.visibleByDefault = true;
  }
  return groups;
}

export function vkAdminMember(vacation, customerId = null) {
  const members = vacation.customers;
  if (customerId != null) return members.find((member) => String(member.id) === customerId || member.recordId === customerId) || null;
  return members[0] || { id: null, customer_label: vacation.label };
}

export async function vkAdminLegacyNoteSources(db, vacation, member) {
  if (member.id == null) return [];
  if (typeof member.id === 'number') {
    const sources = listVkAdminGroups().filter((group) => group.customers[0]?.id === member.id)
      .map((group) => ({ vacationId: group.tripId }));
    if (!db) return sources;
    const pattern = `harness+%+vk-${String(member.id).padStart(3, '0')}-%@harness.invalid`;
    const rows = await db`
      select t.id::text as trip_id, c.id as customer_id, c.email as customer_email
      from trips t join customers c on c.id = t.customer_id
      where lower(c.email) like ${pattern}
      order by t.created_at desc, t.id
    `;
    for (const row of rows.filter((row) => vkAdminRosterId(row.customer_email) === member.id)) {
      sources.push({ vacationId: row.trip_id }, { customerId: row.customer_id, vacationId: row.trip_id });
    }
    return sources;
  }
  if (!db) return [{ vacationId: vacation.tripId }];
  const rows = await db`select id::text as trip_id from trips where customer_id = ${member.id}`;
  return rows.map((row) => ({ vacationId: row.trip_id }));
}

function costs(rows) {
  const total = { actual: 0, estimated: 0, unpriced: 0, hasEstimated: false };
  for (const row of rows) {
    const amount = row.costUsd == null || row.costUsd === '' ? NaN : Number(row.costUsd);
    if (Number.isFinite(amount) && row.costSource === 'openrouter_usage_cost') total.actual += Math.round(amount * 1e8);
    else if (Number.isFinite(amount) && row.costSource === 'openrouter_listed_price') {
      total.hasEstimated = true;
      total.estimated += Math.round(amount * 1e8);
    } else total.unpriced += 1;
  }
  return {
    actual: total.actual / 1e8,
    estimated: total.estimated / 1e8,
    unpriced: total.unpriced,
    hasEstimated: total.hasEstimated,
  };
}

function formatJevScore(value) {
  const score = Number(value);
  if (!Number.isFinite(score)) return '';
  return Number.isInteger(score) ? String(score) : String(Math.round(score * 100) / 100);
}

export function adminReplyGrade(turn) {
  if (!isReply(turn)) return null;
  const live = turn.payload?.liveTranscript && typeof turn.payload.liveTranscript === 'object'
    ? turn.payload.liveTranscript
    : {};
  if (turn.fixedOpener === true || live.fixedOpener === true) {
    return { notGraded: true, reason: String(live.jev?.reason || 'fixed_onboarding_opener') };
  }
  const quality = live.quality && typeof live.quality === 'object' ? live.quality : null;
  const disposition = String(live.jevDisposition || quality?.disposition || '').trim();
  const scoreRaw = quality?.judged === true ? (quality.score ?? live.jevScoreDraft) : live.jevScoreDraft;
  const jevScore = formatJevScore(scoreRaw);
  if (jevScore && disposition) return { notGraded: false, jevScore, qaVerdict: disposition };
  if (live.jev?.jevRan === false && live.jev?.reason) return { notGraded: true, reason: String(live.jev.reason) };
  return { notGraded: true };
}

function isReply(turn) {
  return turn.direction === 'outbound' || ['app', 'assistant'].includes(turn.speaker);
}

function dialog(vacation, ledger, replyCosts = []) {
  const rows = ledger.filter((row) => String(row?.tripId ?? '') === vacation.tripId);
  const byRequest = groupByKey(rows.filter((row) => row.requestId != null), (row) => row.requestId);
  const legacy = new Map();
  const replyDetails = vacation.turns.map((turn, index) => {
    if (!isReply(turn)) return null;
    const callRows = byRequest.get(turn.requestId) || [];
    const generation = callRows.filter((row) => row.ok !== false
      && (!row.purpose || (turn.generationPurpose ? row.purpose === turn.generationPurpose : row.purpose.startsWith('reply_')))
      && (!turn.model || !row.model || row.model === turn.model));
    const call = turn.fixedOpener ? null : generation.at(-1);
    const fallback = !turn.fixedOpener && !callRows.length ? replyCosts[index] : null;
    if (fallback) legacy.set(turn.requestId ?? index, fallback);
    const charge = call || fallback;
    const cost = costs(charge ? [charge] : []);
    return {
      model: call?.model || turn.model || '',
      costs: cost,
      priced: Boolean(charge && !cost.unpriced),
      grade: adminReplyGrade(turn),
    };
  });
  return {
    ...vacation,
    costs: costs([...rows, ...legacy.values()]),
    replyDetails,
  };
}

function storedReplyCost(row) {
  const live = row.payload?.liveTranscript;
  const cost = live?.cost || live?.model?.cost;
  return cost?.status === 'measured' && cost.currency === 'USD' ? { costUsd: cost.dollars, costSource: cost.source } : null;
}

function storedTurn(row, label, includeModelRules) {
  const payload = vacationAppTurnPayloadForClient(row.payload || {});
  const live = row.payload?.liveTranscript || {};
  return {
    turnId: row.id, speaker: row.speaker, direction: row.direction, body: row.body,
    at: iso(row.at), requestId: row.request_id, payload,
    ...(includeModelRules ? { modelRules: row.payload?.modelRules } : {}),
    authorLabel: payload.authorName || live.speakerName || (row.direction === 'inbound' ? label : 'Vacay Keepsake'),
    model: live.shippedModel || live.quality?.shippedModel || live.model?.responseModel || live.modelId || '',
    fixedOpener: live.fixedOpener === true,
    generationPurpose: live.held ? 'reply_interim' : live.shippedRewrite || live.quality?.rewritten ? 'reply_rewrite' : 'reply_draft',
  };
}

function storedLedger(transcript, tripId) {
  const snapshots = new Map();
  for (const turn of transcript) {
    const rows = turn.payload?.liveTranscript?.openrouterCalls;
    if (!Array.isArray(rows)) continue;
    const calls = rows.filter((call) => call && (call.tripId == null || call.tripId === tripId))
      .map((call) => ({ ...call, tripId, requestId: call.requestId ?? turn.request_id }));
    const key = turn.request_id ?? calls[0]?.requestId ?? turn;
    if (calls.length > (snapshots.get(key)?.length ?? 0)) snapshots.set(key, calls);
  }
  return [...snapshots.values()].flat();
}

function tripRecordFromRow(row) {
  const raw = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  const metadata = {
    ...raw,
    ...(row.intake_share === true && raw.intakeShare === undefined ? { intakeShare: true } : {}),
    ...(row.share_slug && !raw.sharedToken && !raw.shareToken && !raw.publicSlug && !raw.source_token && !raw.slug
      ? { sharedToken: row.share_slug } : {}),
  };
  return {
    id: row.trip_id,
    customer_id: row.customer_id ?? null,
    status: row.status ?? null,
    metadata,
  };
}

async function hasHeldInvites(db, tripId) {
  if (!db || !tripId) return false;
  try {
    const rows = await db`select 1 from vacation_trip_state_held_invites where trip_id = ${tripId} limit 1`;
    return rows.length > 0;
  } catch (error) {
    if (error?.code === '42P01') return false;
    throw error;
  }
}

function computeTripCapabilities({ env, trip, hasOwner, emailHeld, serviceAvailable, capabilitiesFn = tripStateCapabilities }) {
  return capabilitiesFn({
    env,
    trip,
    backing: trip ? tripStateBacking(trip) : 'trek',
    grant: hasOwner ? 'owner' : 'none',
    locked: trip ? tripStateSiteLocked(trip) : true,
    read: 'current',
    serviceAvailable,
    emailHeld,
  });
}

export async function findVkAdminVacation(db, id, {
  detail = false, includeModelRules = false, includeCapabilities = false, env = process.env, capabilities: capabilitiesFn = tripStateCapabilities,
} = {}) {
  const fixture = presentVkAdminVacation(id);
  if (fixture) {
    const group = { ...fixture, ...fixtureVisibility };
    const result = detail ? dialog(group, group.ledger || []) : group;
    if (!includeCapabilities) return result;
    return {
      ...result,
      capabilities: computeTripCapabilities({
        env, trip: vkAdminFixtureTrip(id), hasOwner: group.customers.length > 0, emailHeld: false, serviceAvailable: Boolean(db), capabilitiesFn,
      }),
    };
  }
  if (!db || !/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(id)) return null;
  const [row] = await db`
    select t.id::text as trip_id, t.title, t.destination, t.created_at, t.start_date, t.end_date,
      t.status, t.metadata,
      c.id as customer_id, c.email as customer_email, c.display_name, c.first_name, c.last_name,
      t.metadata->>'harnessTag' as harness_tag,
      coalesce(t.metadata->>'sharedToken', t.metadata->>'shareToken', t.metadata->>'publicSlug',
        t.metadata->>'source_token', t.metadata->>'slug') as share_slug,
      t.metadata->'qa' as qa, t.metadata->'survey' as survey, t.metadata->>'intakeShare' = 'true' as intake_share
    from trips t left join customers c on c.id = t.customer_id
    where t.id = ${id}
  `;
  if (!row) return null;
  const group = { ...storedGroup(row), startDate: date(row.start_date), endDate: date(row.end_date) };
  if (!detail) return group;
  const [transcript, sessions, events] = await Promise.all([
    db`
      select id, request_id, speaker, direction, body, payload, coalesce(received_at, sent_at, created_at) as at
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
  const emailHeld = includeCapabilities ? await hasHeldInvites(db, id) : false;
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
  const capabilities = includeCapabilities
    ? computeTripCapabilities({
      env, trip: tripRecordFromRow(row), hasOwner: Boolean(row.customer_id), emailHeld, serviceAvailable: true, capabilitiesFn,
    })
    : undefined;
  return dialog({
    ...group, shareSlug: row.share_slug || (row.intake_share ? intakeShareSlug(id) : ''),
    turns: transcript.map((turn) => storedTurn(turn, group.label, includeModelRules)),
    onboarding, qa: row.qa, survey: row.survey,
    ...(includeCapabilities ? { capabilities } : {}),
  }, storedLedger(transcript, id), transcript.map(storedReplyCost));
}

export function vkAdminDatabase(env) {
  return hasDatabase(env) ? sql(env) : null;
}
