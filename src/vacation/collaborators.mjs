import crypto from 'node:crypto';
import {
  activationStatusPersistent,
  createOnboardingSessionPersistent,
  loadDefaultEulaText,
} from '../onboarding/eula-persistent-core.mjs';
import { createPersistentStoreFromEnv } from '../onboarding/eula-persistent-store.mjs';
import { createTelegramWebAccessSession } from './web-access.mjs';

export const COLLABORATOR_PLANS = {
  telegram_collaborators_single_trip: {
    code: 'telegram_collaborators_single_trip',
    scope: 'single_trip',
    amountCents: 1500,
    maxActiveCollaborators: 1,
  },
  telegram_collaborators_unlimited_trips: {
    code: 'telegram_collaborators_unlimited_trips',
    scope: 'unlimited_trips',
    amountCents: 2700,
    maxActiveCollaborators: 1,
  },
};

export function collaboratorPlan(codeOrScope = 'single_trip') {
  if (COLLABORATOR_PLANS[codeOrScope]) return COLLABORATOR_PLANS[codeOrScope];
  if (codeOrScope === 'single_trip') return COLLABORATOR_PLANS.telegram_collaborators_single_trip;
  if (codeOrScope === 'unlimited_trips') return COLLABORATOR_PLANS.telegram_collaborators_unlimited_trips;
  throw new Error(`Unsupported Telegram collaborator plan: ${codeOrScope}`);
}

export function isCollaboratorInviteRequest(text = '') {
  return /\b(add|invite|let|allow|give)\b.{0,100}\b(wife|husband|spouse|partner|assistant|friend|family|daughter|son|mom|mother|dad|father|collaborator|someone|user)\b.{0,140}\b(telegram|bot|modify|edit|update|change|interact|ability|access)\b/i.test(text)
    || /\b(send|get|create|make|share|give)\b.{0,80}\b(link|checkout|setup|set\s+up)\b.{0,100}\b(her|him|them|wife|husband|spouse|partner|kim|collaborator|assistant|friend|family|someone)\b/i.test(text)
    || /\b(set\s+up|setup)\b.{0,80}\b(her|him|them|wife|husband|spouse|partner|kim|collaborator|assistant|friend|family|someone)\b.{0,100}\b(link|checkout|telegram|bot|access|collaborator)\b/i.test(text)
    || /\btelegram collaborator\b/i.test(text);
}

export function collaboratorToken() {
  return crypto.randomBytes(24).toString('base64url');
}

export function hashToken(token, env = process.env) {
  const salt = env.TIMESYNCHER_COLLABORATOR_TOKEN_SALT || env.TIMESYNCHER_AUDIT_HASH_SALT || 'timesyncher-vacation-collaborators';
  return crypto.createHash('sha256').update(`${salt}:${token}`).digest('hex');
}

export function collaboratorCheckoutCopy({ singleUrl = '', unlimitedUrl = '' } = {}) {
  return [
    'Telegram editing for another person is a paid TimeSyncher Vacation add-on.',
    '',
    'Options:',
    `One vacation: $15${singleUrl ? `\n${singleUrl}` : ''}`,
    `All vacations: $27${unlimitedUrl ? `\n${unlimitedUrl}` : ''}`,
    '',
    'The shared vacation website stays view-only for anyone with only the public URL. Owners and paid Telegram collaborators can edit when they open from Telegram; non-Telegram website invitees use an owner-approved email magic link.',
  ].join('\n');
}

function clean(value, max = 500) {
  return String(value || '').trim().slice(0, max);
}

function botUsername(env = process.env) {
  return String(env.TIMESYNCHER_TELEGRAM_BOT_USERNAME || env.TELEGRAM_BOT_USERNAME || 'TimeSyncherVacationBot').trim().replace(/^@/, '');
}

export function collaboratorTelegramLink(token, env = process.env) {
  return `https://t.me/${botUsername(env)}?start=${encodeURIComponent(token)}`;
}

export function collaboratorWelcomeReply({ invite = {}, websiteUrl = '' } = {}) {
  const tripTitle = clean(invite.trip_title, 180) || 'this vacation';
  const scope = clean(invite.scope, 80) === 'unlimited_trips' ? 'your TimeSyncher vacations' : tripTitle;
  const lines = [
    `You are set up as a paid TimeSyncher Vacation Telegram collaborator for ${scope}.`,
    '',
  ];
  if (websiteUrl) {
    lines.push(`Open the vacation website from this Telegram link so editing can be enabled for your browser: ${websiteUrl}`, '');
  } else if (invite.trip_id) {
    lines.push('Ask me for the vacation website link any time and I will send the Telegram-enabled link for editing.', '');
  }
  lines.push(
    'You can send updates here by typing or by voice note. For a voice note, press and hold the microphone button while you talk.',
    '',
    'Useful updates include places to add, schedule changes, notes about what to avoid, budget preferences, reservations, photos, or videos if those upload options were included.',
    '',
    'Try sending one short update now, like “Add a note that we want a relaxed dinner one night.”',
  );
  return lines.join('\n');
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
    select
      i.*,
      c.email as owner_email,
      c.display_name as owner_display_name,
      t.title as trip_title
    from vacation_collaborator_invites i
    join customers c on c.id = i.owner_customer_id
    left join trips t on t.id = i.trip_id
    where i.deep_link_token_hash = ${hashToken(token, env)}
      and i.status in ('pending_payment', 'paid', 'accepted')
      and (i.expires_at is null or i.expires_at > now())
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

export async function recordPendingCollaboratorTelegramSession(db, {
  invite,
  token = '',
  telegramChatId,
  telegramUserId,
  displayName = '',
  username = '',
  payload = {},
} = {}) {
  if (!invite?.id || !telegramChatId) return null;
  const rows = await db`
    insert into telegram_sessions (
      customer_id, trip_id, onboarding_session_id, telegram_chat_id, telegram_user_id,
      current_step, last_message_at, metadata, updated_at
    )
    values (
      ${invite.owner_customer_id}, ${invite.trip_id || null}, null,
      ${telegramChatId}, ${telegramUserId || null}, 'collaborator_eula_required', now(),
      ${{
        telegramRole: 'pending_collaborator',
        collaboratorInviteId: invite.id,
        collaboratorInviteToken: token || null,
        telegramUsername: username || null,
        displayName: displayName || null,
        ...payload,
      }},
      now()
    )
    on conflict (telegram_chat_id) do update set
      customer_id = excluded.customer_id,
      trip_id = excluded.trip_id,
      telegram_user_id = coalesce(excluded.telegram_user_id, telegram_sessions.telegram_user_id),
      current_step = 'collaborator_eula_required',
      last_message_at = now(),
      metadata = telegram_sessions.metadata || excluded.metadata,
      updated_at = now()
    returning *
  `;
  return rows[0] || null;
}

export async function activateCollaboratorInvite(db, {
  invite,
  eula,
  telegramChatId,
  telegramUserId,
  displayName = '',
  username = '',
  payload = {},
  env = process.env,
} = {}) {
  if (!invite?.id) return { ok: false, status: 'not_found' };
  if (!eula?.ok) return { ok: false, status: 'eula_required', invite, eula };
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

  let websiteAccess = null;
  if (invite.trip_id && telegramChatId) {
    const syntheticEmail = `telegram-${clean(telegramUserId || telegramChatId, 80).replace(/[^a-zA-Z0-9_.-]/g, '-') || collaborator.id}@telegram.timesyncher.local`;
    try {
      websiteAccess = await createTelegramWebAccessSession(db, {
        ownerCustomerId: invite.owner_customer_id,
        tripId: invite.trip_id,
        email: syntheticEmail,
        displayName: clean(displayName || invite.requested_for || 'Telegram collaborator', 180),
        role: 'telegram_collaborator',
        metadata: {
          source: 'telegram_collaborator_activation_welcome',
          telegramChatId: telegramChatId || null,
          telegramUserId: telegramUserId || null,
          collaboratorId: collaborator.id,
          collaboratorInviteId: invite.id,
        },
        env,
      });
    } catch (error) {
      console.warn('TimeSyncher collaborator web access welcome link fallback', error?.message || error);
    }
  }

  return {
    ok: true,
    status: 'accepted',
    invite,
    collaborator,
    eula,
    websiteAccess,
    reply: collaboratorWelcomeReply({ invite, websiteUrl: websiteAccess?.launchUrl || '' }),
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
      reply: [
        'I found this Telegram collaborator invite, but the add-on payment is not confirmed yet.',
        '',
        'If you just checked out, give Stripe a moment and try this Telegram link again.',
      ].join('\n'),
    };
  }

  const eula = await ensureCollaboratorEulaSession(invite, token, env);
  if (!eula.ok) {
    await recordPendingCollaboratorTelegramSession(db, {
      invite,
      token,
      telegramChatId,
      telegramUserId,
      displayName,
      username,
      payload: {
        ...payload,
        eulaSessionId: eula.sessionId,
        eulaAcceptUrl: eula.acceptUrl,
      },
    });
    return {
      ok: false,
      status: 'eula_required',
      invite,
      eula,
      reply: [
        'Your TimeSyncher Vacation collaborator add-on is paid.',
        '',
        'Before Telegram editing is enabled, please review and accept the TimeSyncher EULA:',
        eula.acceptUrl,
        '',
        'After accepting, tap Continue to Telegram. I will finish setup here.',
      ].join('\n'),
    };
  }

  return activateCollaboratorInvite(db, {
    invite,
    eula,
    telegramChatId,
    telegramUserId,
    displayName,
    username,
    payload,
    env,
  });
}

export async function loadPendingCollaboratorInviteForTelegram(db, { telegramChatId, telegramUserId } = {}) {
  if (!telegramChatId && !telegramUserId) return null;
  const rows = await db`
    select
      i.*,
      c.email as owner_email,
      c.display_name as owner_display_name,
      t.title as trip_title,
      s.id as telegram_session_id,
      s.telegram_chat_id as pending_telegram_chat_id,
      s.telegram_user_id as pending_telegram_user_id,
      s.metadata as telegram_session_metadata
    from telegram_sessions s
    join vacation_collaborator_invites i
      on i.id::text = s.metadata->>'collaboratorInviteId'
    join customers c on c.id = i.owner_customer_id
    left join trips t on t.id = i.trip_id
    where coalesce(s.metadata->>'telegramRole', '') = 'pending_collaborator'
      and s.current_step = 'collaborator_eula_required'
      and i.status = 'paid'
      and (
        (${telegramChatId || null}::text is not null and s.telegram_chat_id = ${telegramChatId || null})
        or (${telegramUserId || null}::text is not null and s.telegram_user_id = ${telegramUserId || null})
      )
    order by s.updated_at desc
    limit 1
  `;
  return rows[0] || null;
}

export async function completePendingCollaboratorForTelegram(db, {
  telegramChatId,
  telegramUserId,
  displayName = '',
  username = '',
  payload = {},
  env = process.env,
} = {}) {
  const invite = await loadPendingCollaboratorInviteForTelegram(db, { telegramChatId, telegramUserId });
  if (!invite) return { ok: false, status: 'not_found' };
  const eula = await ensureCollaboratorEulaSession(
    invite,
    invite.telegram_session_metadata?.collaboratorInviteToken || '',
    env,
  );
  if (!eula.ok) {
    return {
      ok: false,
      status: 'eula_required',
      invite,
      eula,
      reply: [
        'Your collaborator add-on is paid, but the TimeSyncher EULA still needs to be accepted before Telegram editing is enabled:',
        eula.acceptUrl,
      ].join('\n'),
    };
  }
  return activateCollaboratorInvite(db, {
    invite,
    eula,
    telegramChatId,
    telegramUserId,
    displayName,
    username,
    payload: {
      ...payload,
      completedFromPendingTelegramSessionId: invite.telegram_session_id || null,
    },
    env,
  });
}

export async function completePendingCollaboratorsForEulaSession(db, {
  sessionId,
  env = process.env,
} = {}) {
  if (!sessionId || !String(sessionId).startsWith('vacation-collaborator-')) return [];
  const inviteId = String(sessionId).slice('vacation-collaborator-'.length);
  const rows = await db`
    select
      i.*,
      c.email as owner_email,
      c.display_name as owner_display_name,
      t.title as trip_title,
      s.id as telegram_session_id,
      s.telegram_chat_id as pending_telegram_chat_id,
      s.telegram_user_id as pending_telegram_user_id,
      s.metadata as telegram_session_metadata
    from telegram_sessions s
    join vacation_collaborator_invites i on i.id = ${inviteId}::uuid
    join customers c on c.id = i.owner_customer_id
    left join trips t on t.id = i.trip_id
    where i.id::text = s.metadata->>'collaboratorInviteId'
      and coalesce(s.metadata->>'telegramRole', '') = 'pending_collaborator'
      and s.current_step = 'collaborator_eula_required'
      and i.status = 'paid'
    order by s.updated_at desc
  `;
  const completed = [];
  for (const invite of rows) {
    const eula = await ensureCollaboratorEulaSession(
      invite,
      invite.telegram_session_metadata?.collaboratorInviteToken || '',
      env,
    );
    if (!eula.ok) continue;
    const result = await activateCollaboratorInvite(db, {
      invite,
      eula,
      telegramChatId: invite.pending_telegram_chat_id,
      telegramUserId: invite.pending_telegram_user_id,
      displayName: invite.telegram_session_metadata?.displayName || '',
      username: invite.telegram_session_metadata?.telegramUsername || '',
      payload: {
        completedFromEulaAccept: true,
        completedFromPendingTelegramSessionId: invite.telegram_session_id || null,
      },
      env,
    });
    completed.push({
      ...result,
      telegramChatId: invite.pending_telegram_chat_id,
      telegramUserId: invite.pending_telegram_user_id,
    });
  }
  return completed;
}

export function collaboratorDeniedCopy() {
  return [
    'I received this, but this Telegram account is not authorized to modify that vacation yet.',
    '',
    'The vacation owner can add you as a paid Telegram collaborator. Non-Telegram website invitees use an owner-approved email magic link.',
  ].join('\n');
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
  const plan = collaboratorPlan(planCode);
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
