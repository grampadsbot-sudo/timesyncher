import {
  activationStatusPersistent,
  createOnboardingSessionPersistent,
  loadCollaboratorAppSeatEulaText,
  loadDefaultEulaText,
  loadSessionPersistent,
  sessionKey,
} from '../onboarding/eula-persistent-core.mjs';
import { createPersistentStoreFromEnv } from '../onboarding/eula-persistent-store.mjs';
import { joinCollaboratorAppSession } from './collaborator-app-seat.mjs';
import {
  collaboratorEulaClientKey,
  collaboratorEulaSessionId,
  collaboratorInviteIdFromEulaSession,
  loadCollaboratorInviteForEmail,
} from './collaborators.mjs';
import { vacationAppLink } from './onboarding.mjs';

const DEFAULT_EULA_VERSION = '2026-06-terms-advisory-only';

function clean(value, max = 180) {
  return String(value || '').trim().slice(0, max);
}

function inviteContact(invite) {
  const metadata = invite?.metadata && typeof invite.metadata === 'object' ? invite.metadata : {};
  const displayName = clean(metadata.displayName || invite?.requested_for, 180);
  const email = clean(metadata.email, 180).toLowerCase();
  const [firstName, ...rest] = displayName.split(/\s+/).filter(Boolean);
  return {
    email,
    displayName,
    firstName: clean(firstName, 80) || null,
    lastName: clean(rest.join(' '), 80) || null,
  };
}

async function ensureInvitePaidForOwnerSeat(db, invite) {
  if (!invite?.id) return null;
  if (invite.status === 'paid' || invite.status === 'accepted') return invite;
  const metadata = invite.metadata && typeof invite.metadata === 'object' ? invite.metadata : {};
  const payer = clean(metadata.payer || 'owner', 40);
  const channel = clean(metadata.channel, 40);
  if (invite.status !== 'pending_payment' || (payer !== 'owner' && channel !== 'vacation-app')) {
    throw Object.assign(new Error(`Collaborator invite is ${invite.status}.`), { statusCode: 409 });
  }
  const rows = await db`
    update vacation_collaborator_invites
    set status = 'paid',
      paid_at = coalesce(paid_at, now()),
      updated_at = now(),
      metadata = metadata || ${{ paidVia: 'owner_app_seat' }}
    where id = ${invite.id}
    returning *
  `;
  return loadCollaboratorInviteForEmail(db, rows[0]?.id || invite.id);
}

export async function ensureCollaboratorAppSeatForInvite(db, invite, env = process.env) {
  const ready = await ensureInvitePaidForOwnerSeat(db, invite);
  const contact = inviteContact(ready);
  if (!contact.email) {
    throw Object.assign(new Error('Collaborator invite is missing an email address.'), { statusCode: 409 });
  }
  const joined = await joinCollaboratorAppSession(db, { invite: ready, contact, env });
  return { invite: ready, joined, contact };
}

async function collaboratorPersistentSession(store, invite, joined, env) {
  const sessionId = collaboratorEulaSessionId(invite);
  const stored = await store.getJson(sessionKey(sessionId));
  const returnUrl = vacationAppLink(joined.token, env);
  if (stored) {
    const next = stored.google?.returnUrl === returnUrl
      ? stored
      : { ...stored, google: { ...(stored.google || {}), returnUrl } };
    if (next !== stored) await store.putJson(sessionKey(sessionId), next);
    const loaded = await loadSessionPersistent(store, sessionId);
    return loaded?.unavailableReason ? next : (loaded || next);
  }
  const contact = inviteContact(invite);
  const created = await createOnboardingSessionPersistent(store, {
    sessionId,
    clientKey: collaboratorEulaClientKey(invite),
    clientLabel: contact.displayName || 'TimeSyncher Vacation collaborator',
    contact: { email: contact.email, phone: null },
    selectedFunctionality: [
      'vacation_planning_onboarding',
      'in_app_text_voice_and_file_intake',
      'hosted_itinerary_generation',
      'support_contact',
    ],
    google: { returnUrl },
    eula: {
      version: env.TIMESYNCHER_EULA_VERSION || DEFAULT_EULA_VERSION,
      text: loadCollaboratorAppSeatEulaText(env),
    },
    expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString(),
  });
  return created;
}

export async function collaboratorSessionForAccept(store, db, sessionId, env = process.env) {
  const inviteId = collaboratorInviteIdFromEulaSession(sessionId);
  if (!inviteId) return null;
  const invite = await loadCollaboratorInviteForEmail(db, inviteId);
  if (!invite) return null;
  const { joined } = await ensureCollaboratorAppSeatForInvite(db, invite, env);
  const refreshed = await loadCollaboratorInviteForEmail(db, inviteId);
  return collaboratorPersistentSession(store, refreshed, joined, env);
}

export async function vacationAppEulaForCollaboratorSeat(session, seat, env = process.env) {
  const inviteId = clean(seat?.inviteId, 80);
  if (!inviteId) {
    return { accepted: false, status: 'missing', sessionId: null, version: null, text: '' };
  }
  const store = createPersistentStoreFromEnv(env);
  const eulaSessionId = collaboratorEulaSessionId({ id: inviteId });
  const version = env.TIMESYNCHER_EULA_VERSION || DEFAULT_EULA_VERSION;
  const stored = await store.getJson(sessionKey(eulaSessionId));
  const status = await activationStatusPersistent(store, collaboratorEulaClientKey({ id: inviteId }), version);
  const accepted = Boolean(status.ok || status.status === 'accepted' || stored?.status === 'accepted');
  const payload = {
    accepted,
    status: accepted ? 'accepted' : (status.status || 'pending'),
    sessionId: eulaSessionId,
    version: null,
    text: '',
  };
  if (accepted) return payload;
  const eulaSession = await loadSessionPersistent(store, eulaSessionId);
  payload.version = eulaSession?.eula?.version || null;
  payload.text = loadCollaboratorAppSeatEulaText(env);
  return payload;
}
