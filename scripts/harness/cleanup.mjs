import { assertThrowaway, isHarnessTag } from './protected.mjs';

export function assertCleanupAllowed({ tag, rows }) {
  if (!isHarnessTag(tag)) throw new Error('refused: cleanup tag is missing');
  for (const row of rows || []) {
    const rowTag = String(row.harnessTag || row.harness_tag || '');
    if (rowTag !== tag) throw new Error('refused: cleanup row is untagged');
    assertThrowaway(row);
  }
}

async function tableExists(db, name) {
  const rows = await db`select to_regclass(${`public.${name}`}) as name`;
  return Boolean(rows[0]?.name);
}

async function dropTripTable(db, table, tripIds) {
  if (!tripIds.length || !(await tableExists(db, table))) return 0;
  if (table === 'transcript_turns') return (await db`delete from transcript_turns where trip_id = any(${tripIds}::uuid[]) returning id`).length;
  if (table === 'budget_items') return (await db`delete from budget_items where trip_id = any(${tripIds}::uuid[]) returning id`).length;
  if (table === 'trip_things') return (await db`delete from trip_things where trip_id = any(${tripIds}::uuid[]) returning id`).length;
  if (table === 'worker_jobs') return (await db`delete from worker_jobs where trip_id = any(${tripIds}::uuid[]) returning id`).length;
  if (table === 'vacation_requests') return (await db`delete from vacation_requests where trip_id = any(${tripIds}::uuid[]) returning id`).length;
  if (table === 'support_notes') return (await db`delete from support_notes where trip_id = any(${tripIds}::uuid[]) returning id`).length;
  if (table === 'telegram_sessions') return (await db`delete from telegram_sessions where trip_id = any(${tripIds}::uuid[]) returning id`).length;
  if (table === 'vacation_web_access_grants') return (await db`delete from vacation_web_access_grants where trip_id = any(${tripIds}::uuid[]) returning id`).length;
  if (table === 'vacation_collaborators') return (await db`delete from vacation_collaborators where trip_id = any(${tripIds}::uuid[]) returning id`).length;
  if (table === 'vacation_collaborator_invites') return (await db`delete from vacation_collaborator_invites where trip_id = any(${tripIds}::uuid[]) returning id`).length;
  if (table === 'entitlements') return (await db`delete from entitlements where trip_id = any(${tripIds}::uuid[]) returning id`).length;
  if (table === 'vacation_reservation_requests') return (await db`delete from vacation_reservation_requests where trip_id = any(${tripIds}::uuid[]) returning id`).length;
  if (table === 'paid_orders') return (await db`delete from paid_orders where trip_id = any(${tripIds}::uuid[]) returning id`).length;
  return 0;
}

export async function deleteTaggedRows(db, tag) {
  if (!isHarnessTag(tag)) throw new Error('refused: cleanup tag is missing');
  const trips = await db`select id::text as id, metadata->>'harnessTag' as harness_tag, coalesce(metadata->>'publicSlug', metadata->>'shareToken', metadata->>'sharedToken', '') as share_token from trips where metadata->>'harnessTag' = ${tag}`;
  const customers = await db`select id::text as id, email, display_name, metadata->>'harnessTag' as harness_tag from customers where metadata->>'harnessTag' = ${tag}`;
  const sessions = await db`select id::text as id, trip_id::text as trip_id, metadata->>'harnessTag' as harness_tag, coalesce(metadata->>'eulaSessionId', '') as eula_session_id from onboarding_sessions where metadata->>'harnessTag' = ${tag}`;
  assertCleanupAllowed({
    tag,
    rows: [
      ...trips.map((row) => ({ harnessTag: row.harness_tag, tripId: row.id, shareToken: row.share_token })),
      ...customers.map((row) => ({ harnessTag: row.harness_tag, email: row.email, displayName: row.display_name })),
      ...sessions.map((row) => ({ harnessTag: row.harness_tag, tripId: row.trip_id })),
    ],
  });
  const deleted = { trips: 0, customers: 0, sessions: 0, media: 0 };
  const tripIds = trips.map((row) => row.id);
  const shares = trips.map((row) => row.share_token).filter(Boolean);
  for (const share of shares) assertThrowaway({ shareToken: share });
  if (shares.length && await tableExists(db, 'thing_media_bindings')) {
    deleted.media = (await db`delete from thing_media_bindings where share_token = any(${shares}::text[]) returning id`).length;
  }
  for (const table of ['transcript_turns', 'budget_items', 'trip_things', 'worker_jobs', 'vacation_requests', 'vacation_reservation_requests', 'support_notes', 'telegram_sessions', 'vacation_web_access_grants', 'vacation_collaborators', 'vacation_collaborator_invites', 'paid_orders', 'entitlements']) {
    await dropTripTable(db, table, tripIds);
  }
  for (const session of sessions) {
    const eulaId = String(session.eula_session_id || '');
    if (!eulaId.startsWith('vacation-') || !(await tableExists(db, 'eula_store_objects'))) continue;
    await db`delete from eula_store_objects where key like ${`%/${eulaId}.json`} or key like ${`%/${eulaId}.html`}`;
  }
  if (tripIds.length) {
    deleted.sessions = (await db`delete from onboarding_sessions where metadata->>'harnessTag' = ${tag} returning id`).length;
    deleted.trips = (await db`delete from trips where id = any(${tripIds}::uuid[]) and metadata->>'harnessTag' = ${tag} returning id`).length;
  }
  const customerIds = customers.map((row) => row.id);
  if (customerIds.length) {
    if (await tableExists(db, 'vacation_reservation_connections')) {
      await db`delete from vacation_reservation_connections where account_customer_id = any(${customerIds}::uuid[])`;
    }
    if (await tableExists(db, 'outbound_emails')) {
      await db`delete from outbound_emails where customer_id = any(${customerIds}::uuid[])`;
    }
    deleted.customers = (await db`delete from customers c where c.id = any(${customerIds}::uuid[]) and c.metadata->>'harnessTag' = ${tag} and not exists (select 1 from trips t where t.customer_id = c.id) returning c.id`).length;
  }
  const remainingRows = await db`select (
    (select count(*) from trips where metadata->>'harnessTag' = ${tag})
    + (select count(*) from customers where metadata->>'harnessTag' = ${tag})
    + (select count(*) from onboarding_sessions where metadata->>'harnessTag' = ${tag})
  )::int as remaining`;
  return { deleted, remaining: Number(remainingRows[0]?.remaining || 0), kept: false };
}
