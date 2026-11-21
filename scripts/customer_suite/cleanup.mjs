import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { isHarnessTag } from '../harness/protected.mjs';
import { assertSafeThrowaway, registerSecret } from './config.mjs';

export async function openSuiteDb(databaseUrl) {
  const url = String(databaseUrl || '').trim();
  if (!url) throw new Error('staging DATABASE_URL is required');
  let neonMod = null;
  try {
    neonMod = await import('@neondatabase/serverless');
  } catch (error) {
    void error;
    const candidates = [
      path.join(process.cwd(), 'node_modules/@neondatabase/serverless/index.mjs'),
      path.join(os.homedir(), 'tsv-dispatch/ship-repo/node_modules/@neondatabase/serverless/index.mjs'),
    ];
    for (const candidate of candidates) {
      if (!fs.existsSync(candidate)) continue;
      neonMod = await import(pathToFileURL(candidate).href);
      break;
    }
  }
  if (!neonMod?.neon) throw new Error('unable to load @neondatabase/serverless');
  return neonMod.neon(url);
}

export function suiteHarnessTag(runId) {
  const safe = String(runId || '').toLowerCase().replace(/[^a-z0-9._-]/g, '');
  const tag = `harness:${safe}:vksuite`;
  if (!isHarnessTag(tag)) throw new Error('refused: invalid suite harness tag');
  return tag;
}

export function assertThrowawayEmail(email) {
  const clean = String(email || '').trim().toLowerCase();
  if (!clean.endsWith('@example.test') || !clean.startsWith('vksuite+')) {
    throw new Error(`refused: non-throwaway email ${clean}`);
  }
  assertSafeThrowaway({ email: clean });
  return clean;
}

export async function createThrowawayCoupon(origin, adminToken, { tag, plan = 'unlimited', label = 'VK customer suite throwaway' }) {
  if (!adminToken) throw new Error('TIMESYNCHER_ADMIN_TOKEN is required to mint a throwaway checkout coupon');
  if (!isHarnessTag(tag)) throw new Error('refused: invalid harness tag for coupon');
  const res = await fetch(`${origin}/api/admin-onboardings?action=create-coupon`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${adminToken}`,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({
      label,
      maxRedemptions: 1,
      metadata: { harnessTag: tag, plan, synthetic: true },
    }),
    signal: AbortSignal.timeout(20000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false || !data.code || !data.coupon?.id) {
    throw new Error(`failed to create throwaway coupon (http ${res.status}): ${data.error || 'unknown'}`);
  }
  registerSecret(data.code);
  return { id: data.coupon.id, code: data.code, hint: data.coupon.codeHint || '' };
}

async function tableExists(db, name) {
  const rows = await db`select to_regclass(${`public.${name}`}) as name`;
  return Boolean(rows[0]?.name);
}

async function deleteByTripIds(db, table, tripIds) {
  if (!tripIds.length || !(await tableExists(db, table))) return 0;
  if (table === 'vacation_mcp_draft_media') return (await db`delete from vacation_mcp_draft_media where scope_trip_id = any(${tripIds}::uuid[]) returning id`).length;
  if (table === 'vacation_mcp_change_sets') return (await db`delete from vacation_mcp_change_sets where scope_trip_id = any(${tripIds}::uuid[]) or target_trip_id = any(${tripIds}::uuid[]) or published_trip_id = any(${tripIds}::uuid[]) returning id`).length;
  if (table === 'vacation_mcp_tokens') return (await db`delete from vacation_mcp_tokens where trip_id = any(${tripIds}::uuid[]) returning id`).length;
  if (table === 'vacation_media_usage') return (await db`delete from vacation_media_usage where trip_id = any(${tripIds}::uuid[]) returning trip_id`).length;
  if (table === 'vacation_media_uploads') return (await db`delete from vacation_media_uploads where trip_id = any(${tripIds}::uuid[]) returning id`).length;
  if (table === 'chat_itinerary_edits') return (await db`delete from chat_itinerary_edits where trip_id = any(${tripIds}::uuid[]) returning id`).length;
  if (table === 'chat_itinerary_anchor_state') return (await db`delete from chat_itinerary_anchor_state where trip_id = any(${tripIds}::uuid[]) returning trip_id`).length;
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
  if (table === 'paid_orders') return (await db`delete from paid_orders where trip_id = any(${tripIds}::uuid[]) returning id`).length;
  if (table === 'entitlements') return (await db`delete from entitlements where trip_id = any(${tripIds}::uuid[]) returning id`).length;
  return 0;
}

export async function cleanupThrowawayRun(db, { tag, emails = [], couponIds = [] }) {
  if (!isHarnessTag(tag)) throw new Error('refused: cleanup tag is missing');
  const safeEmails = [...new Set(emails.map((e) => assertThrowawayEmail(e)))];
  const customers = safeEmails.length
    ? await db`select id::text as id, email, display_name from customers where lower(email) = any(${safeEmails}::text[]) or metadata->>'harnessTag' = ${tag}`
    : await db`select id::text as id, email, display_name from customers where metadata->>'harnessTag' = ${tag}`;
  for (const row of customers) {
    assertSafeThrowaway({ email: row.email, displayName: row.display_name });
    if (!String(row.email || '').toLowerCase().endsWith('@example.test')) {
      throw new Error(`refused: non-synthetic customer ${row.email}`);
    }
  }
  const customerIds = customers.map((r) => r.id);
  const trips = customerIds.length
    ? await db`select id::text as id, title, destination, coalesce(metadata->>'publicSlug', metadata->>'shareToken', metadata->>'sharedToken', '') as share_token from trips where customer_id = any(${customerIds}::uuid[]) or metadata->>'harnessTag' = ${tag}`
    : await db`select id::text as id, title, destination, coalesce(metadata->>'publicSlug', metadata->>'shareToken', metadata->>'sharedToken', '') as share_token from trips where metadata->>'harnessTag' = ${tag}`;
  for (const row of trips) {
    assertSafeThrowaway({ tripId: row.id, title: row.title, destination: row.destination, shareToken: row.share_token });
  }
  const tripIds = trips.map((r) => r.id);
  const shareTokens = trips.map((r) => r.share_token).filter(Boolean);
  const sessions = customerIds.length
    ? await db`select id::text as id, token, coalesce(metadata->>'eulaSessionId', '') as eula_session_id from onboarding_sessions where customer_id = any(${customerIds}::uuid[]) or metadata->>'harnessTag' = ${tag}`
    : await db`select id::text as id, token, coalesce(metadata->>'eulaSessionId', '') as eula_session_id from onboarding_sessions where metadata->>'harnessTag' = ${tag}`;
  const sessionIds = sessions.map((r) => r.id);
  const invites = customerIds.length && (await tableExists(db, 'vacation_collaborator_invites'))
    ? await db`select id::text as id from vacation_collaborator_invites where owner_customer_id = any(${customerIds}::uuid[])`
    : [];
  const inviteIds = invites.map((r) => r.id);

  const deleted = { customers: 0, trips: 0, sessions: 0, coupons: 0, mediaBindings: 0, eulaObjects: 0 };

  if (shareTokens.length && (await tableExists(db, 'thing_media_bindings'))) {
    deleted.mediaBindings = (await db`delete from thing_media_bindings where share_token = any(${shareTokens}::text[]) returning id`).length;
  }
  if (sessionIds.length && (await tableExists(db, 'onboarding_clicks'))) {
    await db`delete from onboarding_clicks where session_id = any(${sessionIds}::uuid[])`;
  }
  if ((customerIds.length || sessionIds.length) && (await tableExists(db, 'outbound_emails'))) {
    if (customerIds.length) await db`delete from outbound_emails where customer_id = any(${customerIds}::uuid[])`;
    if (sessionIds.length) await db`delete from outbound_emails where session_id = any(${sessionIds}::uuid[])`;
  }
  if (customerIds.length && (await tableExists(db, 'checkout_coupon_redemptions'))) {
    await db`delete from checkout_coupon_redemptions where customer_id = any(${customerIds}::uuid[]) or lower(coalesce(email, '')) = any(${safeEmails}::text[])`;
  }
  if (couponIds.length && (await tableExists(db, 'checkout_coupon_redemptions'))) {
    await db`delete from checkout_coupon_redemptions where coupon_id = any(${couponIds}::uuid[])`;
  }
  for (const table of [
    'vacation_mcp_draft_media',
    'vacation_mcp_change_sets',
    'vacation_mcp_tokens',
    'vacation_media_usage',
    'vacation_media_uploads',
    'chat_itinerary_edits',
    'chat_itinerary_anchor_state',
    'transcript_turns',
    'budget_items',
    'trip_things',
    'worker_jobs',
    'vacation_requests',
    'support_notes',
    'telegram_sessions',
    'vacation_web_access_grants',
    'vacation_collaborators',
    'vacation_collaborator_invites',
  ]) {
    await deleteByTripIds(db, table, tripIds);
  }
  if (customerIds.length) {
    if (await tableExists(db, 'transcript_turns')) await db`delete from transcript_turns where customer_id = any(${customerIds}::uuid[])`;
    if (await tableExists(db, 'vacation_requests')) await db`delete from vacation_requests where customer_id = any(${customerIds}::uuid[])`;
    if (await tableExists(db, 'vacation_collaborators')) await db`delete from vacation_collaborators where owner_customer_id = any(${customerIds}::uuid[])`;
    if (await tableExists(db, 'vacation_collaborator_invites')) await db`delete from vacation_collaborator_invites where owner_customer_id = any(${customerIds}::uuid[])`;
    if (await tableExists(db, 'vacation_web_access_grants')) await db`delete from vacation_web_access_grants where owner_customer_id = any(${customerIds}::uuid[]) or lower(coalesce(email, '')) = any(${safeEmails}::text[])`;
    if (await tableExists(db, 'vacation_mcp_tokens')) await db`delete from vacation_mcp_tokens where owner_customer_id = any(${customerIds}::uuid[])`;
  }
  if (sessionIds.length) {
    deleted.sessions = (await db`delete from onboarding_sessions where id = any(${sessionIds}::uuid[]) returning id`).length;
  }
  if (customerIds.length) {
    if (await tableExists(db, 'paid_orders')) await db`delete from paid_orders where customer_id = any(${customerIds}::uuid[])`;
    if (await tableExists(db, 'entitlements')) await db`delete from entitlements where customer_id = any(${customerIds}::uuid[])`;
  }
  if (tripIds.length) {
    deleted.trips = (await db`delete from trips where id = any(${tripIds}::uuid[]) returning id`).length;
  }
  if (customerIds.length) {
    deleted.customers = (await db`delete from customers where id = any(${customerIds}::uuid[]) returning id`).length;
  }
  if (await tableExists(db, 'checkout_coupons')) {
    const couponDel = couponIds.length
      ? await db`delete from checkout_coupons where id = any(${couponIds}::uuid[]) or metadata->>'harnessTag' = ${tag} returning id`
      : await db`delete from checkout_coupons where metadata->>'harnessTag' = ${tag} returning id`;
    deleted.coupons = couponDel.length;
  }
  if (await tableExists(db, 'eula_store_objects')) {
    const eulaIds = [
      ...sessions.map((s) => s.eula_session_id || (s.token ? `vacation-${s.token}` : '')),
      ...inviteIds.map((id) => `vacation-collaborator-${id}`),
    ].filter((id) => id.startsWith('vacation-'));
    for (const eulaId of eulaIds) {
      const removed = await db`delete from eula_store_objects where key like ${`%/${eulaId}.json`} or key like ${`%/${eulaId}.html`} returning key`;
      deleted.eulaObjects += removed.length;
    }
  }

  const remainingCustomers = safeEmails.length
    ? Number((await db`select count(*)::int as c from customers where lower(email) = any(${safeEmails}::text[]) or metadata->>'harnessTag' = ${tag}`)[0]?.c || 0)
    : Number((await db`select count(*)::int as c from customers where metadata->>'harnessTag' = ${tag}`)[0]?.c || 0);
  const remainingTrips = tripIds.length
    ? Number((await db`select count(*)::int as c from trips where id = any(${tripIds}::uuid[]) or metadata->>'harnessTag' = ${tag}`)[0]?.c || 0)
    : Number((await db`select count(*)::int as c from trips where metadata->>'harnessTag' = ${tag}`)[0]?.c || 0);
  const remainingSessions = sessionIds.length
    ? Number((await db`select count(*)::int as c from onboarding_sessions where id = any(${sessionIds}::uuid[]) or metadata->>'harnessTag' = ${tag}`)[0]?.c || 0)
    : Number((await db`select count(*)::int as c from onboarding_sessions where metadata->>'harnessTag' = ${tag}`)[0]?.c || 0);
  const remainingCoupons = (await tableExists(db, 'checkout_coupons'))
    ? Number((await db`select count(*)::int as c from checkout_coupons where metadata->>'harnessTag' = ${tag}`)[0]?.c || 0)
    : 0;
  const remaining = remainingCustomers + remainingTrips + remainingSessions + remainingCoupons;
  return {
    deleted,
    remaining,
    remainingByTable: {
      customers: remainingCustomers,
      trips: remainingTrips,
      sessions: remainingSessions,
      coupons: remainingCoupons,
    },
    ok: remaining === 0,
  };
}
