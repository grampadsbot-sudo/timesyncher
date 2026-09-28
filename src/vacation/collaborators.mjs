import crypto from 'node:crypto';
import {
  activationStatusPersistent,
  createOnboardingSessionPersistent,
  loadDefaultEulaText,
} from '../onboarding/eula-persistent-core.mjs';
import { createPersistentStoreFromEnv } from '../onboarding/eula-persistent-store.mjs';
import { optionalConfigCents, requiredConfigCents } from './checkout-pricing.mjs';

export const COLLABORATOR_PLANS = {
  telegram_collaborators_single_trip: {
    code: 'telegram_collaborators_single_trip',
    scope: 'single_trip',
    maxActiveCollaborators: 1,
  },
  telegram_collaborators_unlimited_trips: {
    code: 'telegram_collaborators_unlimited_trips',
    scope: 'unlimited_trips',
    maxActiveCollaborators: 1,
  },
};

function withConfiguredAmount(plan, env) {
  if (plan.scope === 'single_trip') {
    return {
      ...plan,
      amountCents: requiredConfigCents(env?.TIMESYNCHER_COLLABORATOR_SINGLE_PRICE_CENTS, 'TIMESYNCHER_COLLABORATOR_SINGLE_PRICE_CENTS'),
    };
  }
  if (plan.scope !== 'unlimited_trips') return plan;
  return {
    ...plan,
    amountCents: requiredConfigCents(env?.TIMESYNCHER_ORDER_BUMP_PRICE_CENTS, 'TIMESYNCHER_ORDER_BUMP_PRICE_CENTS'),
  };
}

export function collaboratorPlanList(env = process.env) {
  return Object.values(COLLABORATOR_PLANS).map((plan) => {
    const amountCents = plan.scope === 'single_trip'
      ? optionalConfigCents(env?.TIMESYNCHER_COLLABORATOR_SINGLE_PRICE_CENTS)
      : optionalConfigCents(env?.TIMESYNCHER_ORDER_BUMP_PRICE_CENTS);
    return {
      code: plan.code,
      scope: plan.scope,
      amountCents,
      maxActiveCollaborators: plan.maxActiveCollaborators,
    };
  });
}

export function collaboratorPlan(codeOrScope = 'single_trip', env = process.env) {
  if (COLLABORATOR_PLANS[codeOrScope]) return withConfiguredAmount(COLLABORATOR_PLANS[codeOrScope], env);
  if (codeOrScope === 'single_trip') return withConfiguredAmount(COLLABORATOR_PLANS.telegram_collaborators_single_trip, env);
  if (codeOrScope === 'unlimited_trips') return withConfiguredAmount(COLLABORATOR_PLANS.telegram_collaborators_unlimited_trips, env);
  throw new Error(`Unsupported Telegram collaborator plan: ${codeOrScope}`);
}

export function isCollaboratorInviteRequest(text = '') {
  return /\b(add|invite|let|allow|give)\b.{0,100}\b(wife|husband|spouse|partner|assistant|friend|family|daughter|son|mom|mother|dad|father|collaborator|someone|user)\b.{0,140}\b(telegram|bot|modify|edit|update|change|interact|ability|access)\b/i.test(text)
    || /\b(send|get|create|make|share|give)\b.{0,80}\b(link|checkout|setup|set\s+up)\b.{0,100}\b(her|him|them|wife|husband|spouse|partner|collaborator|assistant|friend|family|someone)\b/i.test(text)
    || /\b(set\s+up|setup)\b.{0,80}\b(her|him|them|wife|husband|spouse|partner|collaborator|assistant|friend|family|someone)\b.{0,100}\b(link|checkout|telegram|bot|access|collaborator)\b/i.test(text)
    || /\btelegram collaborator\b/i.test(text);
}

export function collaboratorToken() {
  return crypto.randomBytes(24).toString('base64url');
}

export function hashToken(token, env = process.env) {
  const salt = env.TIMESYNCHER_COLLABORATOR_TOKEN_SALT || env.TIMESYNCHER_AUDIT_HASH_SALT || 'timesyncher-vacation-collaborators';
  return crypto.createHash('sha256').update(`${salt}:${token}`).digest('hex');
}

export function collaboratorCheckoutCopy({ singleUrl = '', unlimitedUrl = '', env = process.env } = {}) {
  return {
    ask: 'collaborator_checkout',
    singleTrip: {
      cents: optionalConfigCents(env?.TIMESYNCHER_COLLABORATOR_SINGLE_PRICE_CENTS),
      url: singleUrl || null,
    },
    unlimitedTrips: {
      cents: optionalConfigCents(env?.TIMESYNCHER_ORDER_BUMP_PRICE_CENTS),
      url: unlimitedUrl || null,
    },
  };
}

function clean(value, max = 500) {
  return String(value || '').trim().slice(0, max);
}

function botUsername(env = process.env) {
  return String(env.TIMESYNCHER_TELEGRAM_BOT_USERNAME || env.TELEGRAM_BOT_USERNAME || 'TimeSyncherVacationBot')
    .replace(/\\n/g, '')
    .replace(/^["']|["']$/g, '')
    .trim()
    .replace(/^@/, '');
}

export function collaboratorTelegramLink(token, env = process.env) {
  return `https://t.me/${botUsername(env)}?start=${encodeURIComponent(token)}`;
}

export function collaboratorEulaSessionId(invite) {
  return `vacation-collaborator-${invite.id}`;
}

export function collaboratorEulaClientKey(invite) {
  return `vacation-collaborator:${invite.id}`;
}

export function collaboratorEulaAcceptUrl(invite, env = process.env) {
  const base = String(env.TIMESYNCHER_SITE_BASE_URL || env.SITE_BASE_URL || 'https://www.timesyncher.com').replace(/\/+$/, '');
  return `${base}/accept/${encodeURIComponent(collaboratorEulaSessionId(invite))}`;
}

export async function loadCollaboratorInviteByToken(db, token, env = process.env) {
  if (!token) return null;
  const rows = await db`
    select *
    from vacation_collaborator_invites
    where deep_link_token_hash = ${hashToken(token, env)}
      and status in ('pending_payment', 'paid', 'accepted')
      and (expires_at is null or expires_at > now())
    limit 1
  `;
  return rows[0] || null;
}

export async function loadCollaboratorInviteForEmail(db, inviteId) {
  if (!inviteId) return null;
  const rows = await db`
    select
      i.*,
      c.email as owner_email,
      c.display_name as owner_display_name,
      t.title as trip_title
    from vacation_collaborator_invites i
    join customers c on c.id = i.owner_customer_id
    left join trips t on t.id = i.trip_id
    where i.id = ${inviteId}
    limit 1
  `;
  return rows[0] || null;
}

export async function markCollaboratorInvitePaid(db, { inviteId, token = '', metadata = {}, env = process.env } = {}) {
  const invite = inviteId
    ? await loadCollaboratorInviteForEmail(db, inviteId)
    : await loadCollaboratorInviteByToken(db, token, env);
  if (!invite) throw Object.assign(new Error('Collaborator invite not found.'), { statusCode: 404 });
  if (invite.status === 'accepted' || invite.status === 'paid') return invite;
  if (invite.status !== 'pending_payment') {
    throw Object.assign(new Error(`Collaborator invite is ${invite.status}.`), { statusCode: 409 });
  }

  const rows = await db`
    update vacation_collaborator_invites
    set status = 'paid',
      stripe_checkout_session_id = coalesce(stripe_checkout_session_id, ${metadata.stripeCheckoutSessionId || null}),
      stripe_payment_intent_id = coalesce(stripe_payment_intent_id, ${metadata.stripePaymentIntentId || null}),
      paid_at = coalesce(paid_at, now()),
      updated_at = now(),
      metadata = metadata || ${metadata}
    where id = ${invite.id}
    returning *
  `;
  return loadCollaboratorInviteForEmail(db, rows[0].id);
}

export async function ensureCollaboratorEulaSession(invite, token, env = process.env) {
  const store = createPersistentStoreFromEnv(env);
  const sessionId = collaboratorEulaSessionId(invite);
  const status = await activationStatusPersistent(
    store,
    collaboratorEulaClientKey(invite),
    env.TIMESYNCHER_EULA_VERSION || '2026-04-initial-draft',
  );
  if (status.ok) {
    return {
      ok: true,
      sessionId,
      status: 'accepted',
      receiptSha256: status.receiptSha256,
      acceptUrl: collaboratorEulaAcceptUrl(invite, env),
    };
  }

  await createOnboardingSessionPersistent(store, {
    sessionId,
    clientKey: collaboratorEulaClientKey(invite),
    clientLabel: clean(invite.requested_for, 180) || 'TimeSyncher Vacation collaborator',
    contact: {},
    selectedFunctionality: [
      'telegram_collaborator_modify_access',
      'hosted_itinerary_context',
      'vacation_update_requests',
    ],
    google: {
      returnUrl: collaboratorTelegramLink(token, env),
    },
    eula: {
      version: env.TIMESYNCHER_EULA_VERSION || '2026-04-initial-draft',
      text: loadDefaultEulaText(),
    },
    expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString(),
  }).catch((error) => {
    if (!/already exists|already/i.test(error?.message || '')) throw error;
  });

  return {
    ok: false,
    sessionId,
    status: 'pending',
    acceptUrl: collaboratorEulaAcceptUrl(invite, env),
  };
}

export async function acceptCollaboratorInvite(db, {
  token,
  telegramChatId,
  telegramUserId,
  displayName = '',
  username = '',
  payload = {},
  env = process.env,
}) {
  const invite = await loadCollaboratorInviteByToken(db, token, env);
  if (!invite) return { ok: false, status: 'not_found' };
  if (invite.status === 'pending_payment') {
    return {
      ok: false,
      status: 'payment_pending',
      invite,
      facts: { ask: 'payment_pending', paid: false },
    };
  }

  const eula = await ensureCollaboratorEulaSession(invite, token, env);
  if (!eula.ok) {
    return {
      ok: false,
      status: 'eula_required',
      invite,
      eula,
      facts: { ask: 'eula', paid: true, acceptUrl: eula.acceptUrl || null },
    };
  }

  const existing = await activeCollaboratorForTelegram(db, {
    ownerCustomerId: invite.owner_customer_id,
    tripId: invite.trip_id,
    telegramChatId,
    telegramUserId,
  });
  const collaborator = existing || (await db`
    insert into vacation_collaborators (
      invite_id, owner_customer_id, trip_id, telegram_chat_id, telegram_user_id,
      display_name, plan_code, scope, status, accepted_eula_version, metadata,
      accepted_at, updated_at
    )
    values (
      ${invite.id}, ${invite.owner_customer_id}, ${invite.trip_id || null},
      ${telegramChatId || null}, ${telegramUserId || null}, ${displayName || null},
      ${invite.plan_code}, ${invite.scope}, 'active',
      ${env.TIMESYNCHER_EULA_VERSION || '2026-04-initial-draft'},
      ${{
        source: 'telegram_collaborator_invite',
        telegramUsername: username || null,
        eulaSessionId: eula.sessionId,
        eulaReceiptSha256: eula.receiptSha256 || null,
        ...payload,
      }},
      now(), now()
    )
    returning *
  `)[0];

  await db`
    update vacation_collaborator_invites
    set status = 'accepted',
      accepted_at = coalesce(accepted_at, now()),
      updated_at = now(),
      metadata = metadata || ${{
        acceptedByTelegramChatId: telegramChatId || null,
        acceptedByTelegramUserId: telegramUserId || null,
        collaboratorId: collaborator.id,
      }}
    where id = ${invite.id}
  `;

  await db`
    insert into telegram_sessions (
      customer_id, trip_id, onboarding_session_id, telegram_chat_id, telegram_user_id,
      current_step, last_message_at, metadata, updated_at
    )
    values (
      ${invite.owner_customer_id}, ${invite.trip_id || null}, null,
      ${telegramChatId}, ${telegramUserId || null}, 'collaborator_active', now(),
      ${{
        telegramRole: 'collaborator',
        collaboratorId: collaborator.id,
        collaboratorInviteId: invite.id,
        telegramUsername: username || null,
        displayName: displayName || null,
      }},
      now()
    )
    on conflict (telegram_chat_id) do update set
      customer_id = excluded.customer_id,
      trip_id = excluded.trip_id,
      telegram_user_id = coalesce(excluded.telegram_user_id, telegram_sessions.telegram_user_id),
      current_step = 'collaborator_active',
      last_message_at = now(),
      metadata = telegram_sessions.metadata || excluded.metadata,
      updated_at = now()
    returning *
  `;

  return {
    ok: true,
    status: 'accepted',
    invite,
    collaborator,
    eula,
    facts: { ask: 'collaborator_accepted', active: true, status: 'accepted' },
  };
}

export function collaboratorDeniedCopy() {
  return { ask: 'collaborator_denied', authorized: false };
}

export async function activeCollaboratorForTelegram(db, { ownerCustomerId, tripId, telegramChatId, telegramUserId }) {
  if (!ownerCustomerId || (!telegramChatId && !telegramUserId)) return null;
  const rows = await db`
    select *
    from vacation_collaborators
    where owner_customer_id = ${ownerCustomerId}
      and status = 'active'
      and (
        (${telegramChatId || null}::text is not null and telegram_chat_id = ${telegramChatId || null})
        or (${telegramUserId || null}::text is not null and telegram_user_id = ${telegramUserId || null})
      )
      and (scope = 'unlimited_trips' or trip_id = ${tripId || null})
    order by accepted_at desc nulls last, created_at desc
    limit 1
  `;
  return rows[0] || null;
}

export async function countActiveCollaborators(db, ownerCustomerId) {
  if (!ownerCustomerId) return 0;
  const rows = await db`
    select count(*)::int as count
    from vacation_collaborators
    where owner_customer_id = ${ownerCustomerId}
      and status = 'active'
  `;
  return Number(rows[0]?.count || 0);
}

export async function createCollaboratorInvite(db, { ownerCustomerId, tripId, planCode, requestedFor = '', metadata = {}, env = process.env }) {
  const plan = collaboratorPlan(planCode, env);
  const token = collaboratorToken();
  const rows = await db`
    insert into vacation_collaborator_invites (
      owner_customer_id, trip_id, plan_code, scope, requested_for, status, deep_link_token_hash, metadata
    )
    values (
      ${ownerCustomerId}, ${plan.scope === 'single_trip' ? tripId : null}, ${plan.code}, ${plan.scope},
      ${requestedFor || null}, 'pending_payment', ${hashToken(token, env)}, ${metadata}
    )
    returning *
  `;
  return { invite: rows[0], token };
}
