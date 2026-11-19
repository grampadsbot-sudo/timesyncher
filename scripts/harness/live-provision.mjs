import { randomBytes } from 'node:crypto';
import { assertThrowaway } from './protected.mjs';
import { deleteTaggedRows } from './cleanup.mjs';

export function singlePlanEntitlement(meta, tripId) {
  return {
    plan: 'single',
    status: 'active',
    trip_id: tripId,
    metadata: { ...meta, product: 'timesyncher_vacation_single' },
  };
}

function dialogParty(story) {
  return {
    primary: { name: story.customer.name, role: 'Owner' },
    collaborators: story.party.collaborators || [],
    preference_subjects: story.party.kids || [],
    viewers: story.party.viewers || [],
    editors: story.party.editors || [],
  };
}

export async function provisionThrowaway(db, story, { tag, runId, env }) {
  assertThrowaway({ name: story.customer.name, displayName: story.customer.name, email: story.customer.email_alias });
  const email = `harness+${runId}+${story.customer.email_alias}@harness.invalid`.toLowerCase();
  assertThrowaway({ email, displayName: story.customer.name });
  await deleteTaggedRows(db, tag);
  const replyBackend = story.reply_backend === 'openrouter' || story.reply_backend === 'vk_bot_mcp' ? story.reply_backend : '';
  const meta = { harnessTag: tag, harnessRunId: runId, harnessStoryId: story.story_id, ...(replyBackend ? { replyBackend } : {}) };
  try {
  return await insertThrowaway(db, story, { tag, runId, env, meta, email });
  } catch (error) {
    await deleteTaggedRows(db, tag);
    throw error;
  }
}

async function insertThrowaway(db, story, { tag, runId, env, meta, email }) {
  const customers = await db`
    insert into customers (email, display_name, first_name, metadata)
    values (${email}, ${story.customer.name}, ${story.customer.name.split(/\s+/)[0]}, ${meta})
    returning id
  `;
  const customerId = customers[0].id;
  const trips = await db`
    insert into trips (customer_id, title, destination, start_date, end_date, party, status, metadata)
    values (
      ${customerId}, ${`${story.destination} harness`}, ${story.destination},
      ${story.dates.start}::date, ${story.dates.end}::date, ${story.party}, 'planning',
      ${{ ...meta, dialogParty: dialogParty(story) }}
    )
    returning id
  `;
  const tripId = trips[0].id;
  assertThrowaway({ tripId });
  const { assignTripSiteUrl } = await import('../../src/vacation/trip-assign-site-url.mjs');
  const site = await assignTripSiteUrl(db, tripId, env);
  assertThrowaway({ tripId, shareToken: site.publicSlug });
  const purchase = singlePlanEntitlement(meta, tripId);
  const entitlements = await db`
    insert into entitlements (customer_id, trip_id, plan, status, metadata)
    values (${customerId}, ${purchase.trip_id}, ${purchase.plan}, ${purchase.status}, ${purchase.metadata})
    returning id
  `;
  const orders = await db`
    insert into paid_orders (
      customer_id, trip_id, entitlement_id, amount_cents, currency, plan, status, contact, metadata
    )
    values (
      ${customerId}, ${tripId}, ${entitlements[0].id}, 0, 'usd', 'single', 'paid',
      ${{ email, displayName: story.customer.name }}, ${meta}
    )
    returning id
  `;
  const token = randomBytes(24).toString('hex');
  const sessions = await db`
    insert into onboarding_sessions (customer_id, trip_id, order_id, token, status, current_step, metadata)
    values (${customerId}, ${tripId}, ${orders[0].id}, ${token}, 'purchase_confirmed', 'post_purchase', ${meta})
    returning id
  `;
  const sessionRow = {
    id: sessions[0].id,
    token,
    email,
    display_name: story.customer.name,
    first_name: story.customer.name.split(/\s+/)[0],
  };
  const { eulaSessionIdForOnboarding } = await import('../../src/vacation/onboarding.mjs');
  const eulaSessionId = eulaSessionIdForOnboarding(sessionRow);
  await db`
    update onboarding_sessions
    set metadata = coalesce(metadata, '{}'::jsonb) || ${{ eulaSessionId }}
    where id = ${sessions[0].id} and metadata->>'harnessTag' = ${tag}
  `;
  return {
    customerId,
    tripId,
    token,
    shareToken: site.publicSlug,
    publicUrl: site.publicUrl,
    eulaSessionId,
  };
}
