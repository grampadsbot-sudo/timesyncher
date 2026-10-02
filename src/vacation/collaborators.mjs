import crypto from 'node:crypto';
import { optionalConfigCents, requiredConfigCents } from './checkout-pricing.mjs';

export const COLLABORATOR_PLANS = {
  telegram_collaborators_single_trip: {
    code: 'telegram_collaborators_single_trip',
    scope: 'single_trip',
    maxActiveCollaborators: 1,
  },
};

function withConfiguredAmount(plan, env) {
  return {
    ...plan,
    amountCents: requiredConfigCents(env?.TIMESYNCHER_COLLABORATOR_SINGLE_PRICE_CENTS, 'TIMESYNCHER_COLLABORATOR_SINGLE_PRICE_CENTS'),
  };
}

export function collaboratorPlan(codeOrScope = 'single_trip', env = process.env) {
  if (COLLABORATOR_PLANS[codeOrScope]) return withConfiguredAmount(COLLABORATOR_PLANS[codeOrScope], env);
  if (codeOrScope === 'single_trip') return withConfiguredAmount(COLLABORATOR_PLANS.telegram_collaborators_single_trip, env);
  throw new Error(`Unsupported Telegram collaborator plan: ${codeOrScope}`);
}

export function isCollaboratorInviteRequest(text = '') {
  return /\b(add|invite|let|allow|give)\b.{0,100}\b(wife|husband|spouse|partner|assistant|friend|family|daughter|son|mom|mother|dad|father|collaborator|someone|user)\b.{0,140}\b(modify|edit|update|change|interact|ability|access)\b/i.test(text)
    || /\b(send|get|create|make|share|give)\b.{0,80}\b(link|checkout|setup|set\s+up)\b.{0,100}\b(her|him|them|wife|husband|spouse|partner|collaborator|assistant|friend|family|someone)\b/i.test(text)
    || /\b(set\s+up|setup)\b.{0,80}\b(her|him|them|wife|husband|spouse|partner|collaborator|assistant|friend|family|someone)\b.{0,100}\b(link|checkout|access|collaborator)\b/i.test(text);
}

export function collaboratorToken() {
  return crypto.randomBytes(24).toString('base64url');
}

export function hashToken(token, env = process.env) {
  const salt = env.TIMESYNCHER_COLLABORATOR_TOKEN_SALT || env.TIMESYNCHER_AUDIT_HASH_SALT || 'timesyncher-vacation-collaborators';
  return crypto.createHash('sha256').update(`${salt}:${token}`).digest('hex');
}

export function collaboratorCheckoutCopy({ singleUrl = '', url = '', env = process.env } = {}) {
  return {
    ask: 'collaborator_checkout',
    plan: 'telegram_collaborators_single_trip',
    perVacation: true,
    cents: optionalConfigCents(env?.TIMESYNCHER_COLLABORATOR_SINGLE_PRICE_CENTS),
    url: url || singleUrl || null,
  };
}

export function collaboratorEulaSessionId(invite) {
  return `vacation-collaborator-${invite.id}`;
}

export function isCollaboratorEulaSessionId(sessionId) {
  return String(sessionId || '').startsWith('vacation-collaborator-');
}

export function collaboratorInviteIdFromEulaSession(sessionId) {
  const id = String(sessionId || '');
  if (!isCollaboratorEulaSessionId(id)) return '';
  return id.slice('vacation-collaborator-'.length);
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

export function collaboratorDeniedCopy() {
  return { ask: 'collaborator_denied', authorized: false };
}

export async function countActiveCollaborators(db, ownerCustomerId, tripId = '') {
  if (!ownerCustomerId) return 0;
  const rows = tripId
    ? await db`
      select count(*)::int as count
      from vacation_collaborators
      where owner_customer_id = ${ownerCustomerId}
        and trip_id = ${tripId}
        and status = 'active'
    `
    : await db`
      select count(*)::int as count
      from vacation_collaborators
      where owner_customer_id = ${ownerCustomerId}
        and status = 'active'
    `;
  return Number(rows[0]?.count || 0);
}

export async function createCollaboratorInvite(db, { ownerCustomerId, tripId, planCode, requestedFor = '', metadata = {}, env = process.env }) {
  const normalizedTripId = String(tripId || '').trim() || null;
  const onboardingSessionId = String(metadata?.onboardingSessionId || '').trim() || null;
  if (!normalizedTripId && !onboardingSessionId) {
    throw Object.assign(new Error('tripId or onboardingSessionId is required for a collaborator invite.'), { statusCode: 400 });
  }
  const plan = collaboratorPlan(planCode || 'single_trip', env);
  const token = collaboratorToken();
  const inviteMetadata = {
    ...(metadata && typeof metadata === 'object' ? metadata : {}),
    ...(onboardingSessionId ? { onboardingSessionId } : {}),
  };
  const rows = await db`
    insert into vacation_collaborator_invites (
      owner_customer_id, trip_id, plan_code, scope, requested_for, status, deep_link_token_hash, metadata
    )
    values (
      ${ownerCustomerId}, ${normalizedTripId}, ${plan.code}, ${plan.scope},
      ${requestedFor || null}, 'pending_payment', ${hashToken(token, env)}, ${inviteMetadata}
    )
    returning *
  `;
  return { invite: rows[0], token };
}

export async function attachSessionCollaboratorInvitesToTrip(db, { ownerCustomerId, tripId, onboardingSessionId } = {}) {
  const ownerId = String(ownerCustomerId || '').trim();
  const normalizedTripId = String(tripId || '').trim();
  const sessionId = String(onboardingSessionId || '').trim();
  if (!ownerId || !normalizedTripId || !sessionId) return [];
  const rows = await db`
    update vacation_collaborator_invites
    set trip_id = ${normalizedTripId},
      updated_at = now()
    where owner_customer_id = ${ownerId}
      and trip_id is null
      and metadata->>'onboardingSessionId' = ${sessionId}
    returning *
  `;
  for (const invite of rows) {
    const metadata = invite.metadata && typeof invite.metadata === 'object' ? invite.metadata : {};
    const token = String(metadata.collaboratorOnboardingToken || '').trim();
    await db`
      update vacation_collaborators
      set trip_id = ${normalizedTripId},
        updated_at = now(),
        metadata = metadata || ${{ onboardingSessionId: sessionId }}
      where invite_id = ${invite.id}
        and trip_id is null
    `;
    if (token) {
      await db`
        update onboarding_sessions
        set trip_id = ${normalizedTripId},
          metadata = jsonb_set(
            jsonb_set(coalesce(metadata, '{}'::jsonb), '{seat,ownerTripId}', to_jsonb(${normalizedTripId}::text), true),
            '{seat,ownerOnboardingSessionId}',
            to_jsonb(${sessionId}::text),
            true
          ),
          updated_at = now()
        where token = ${token}
      `;
    }
  }
  return rows;
}
