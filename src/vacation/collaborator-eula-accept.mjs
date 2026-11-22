import {
  activationStatusPersistent,
  createOnboardingSessionPersistent,
  loadCollaboratorAppSeatEulaText,
  loadSessionPersistent,
  receiptKey,
  sessionKey,
  validateReceiptForActivation,
} from '../onboarding/eula-persistent-core.mjs';
import { createPersistentStoreFromEnv } from '../onboarding/eula-persistent-store.mjs';
import { ensureCollaboratorAppSeatForInvite, seatFromSession } from './collaborator-app-seat.mjs';
import {
  collaboratorEulaClientKey,
  collaboratorEulaSessionId,
  collaboratorInviteIdFromEulaSession,
  loadCollaboratorInviteForEmail,
} from './collaborators.mjs';
import {
  eulaClientKeyForOnboarding,
  eulaSessionIdForOnboarding,
  getSessionByToken,
  vacationAppLink,
  vacationEulaStatus,
} from './onboarding.mjs';

export { ensureCollaboratorAppSeatForInvite };

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

export function personEulaKey(customerId) {
  const id = clean(customerId, 80);
  return id ? `person-eula/${id}.json` : '';
}

function personEulaClientKey(customerId) {
  const id = clean(customerId, 80);
  return id ? `vacation-person:${id}` : '';
}

function ownerTokenFromEulaSessionId(sessionId) {
  const id = String(sessionId || '');
  if (!id.startsWith('vacation-') || id.startsWith('vacation-collaborator-')) return '';
  return id.slice('vacation-'.length);
}

async function safeQuery(fn, fallback = []) {
  try {
    return await fn();
  } catch (error) {
    void error;
    return fallback;
  }
}

async function resolvePersonCustomerId(db, { sessionId = '', session = null } = {}) {
  const direct = clean(session?.personCustomerId || session?.customer_id, 80);
  if (direct) return direct;
  if (!db) return '';
  const inviteId = collaboratorInviteIdFromEulaSession(sessionId);
  if (inviteId) {
    const invite = await safeQuery(() => loadCollaboratorInviteForEmail(db, inviteId), null);
    const fromInvite = clean(invite?.metadata?.collaboratorCustomerId, 80);
    if (fromInvite) return fromInvite;
    const invEmail = clean(invite?.metadata?.email, 180).toLowerCase();
    if (invEmail) {
      const rows = await safeQuery(() => db`select id from customers where lower(email) = ${invEmail} limit 1`, []);
      if (rows[0]?.id) return clean(rows[0].id, 80);
    }
  }
  const ownerToken = ownerTokenFromEulaSessionId(sessionId);
  if (ownerToken) {
    const row = await safeQuery(() => getSessionByToken(db, ownerToken), null);
    if (row?.customer_id) return clean(row.customer_id, 80);
  }
  const email = clean(session?.contact?.email || session?.email, 180).toLowerCase();
  if (email) {
    const rows = await safeQuery(() => db`select id from customers where lower(email) = ${email} limit 1`, []);
    if (rows[0]?.id) return clean(rows[0].id, 80);
  }
  return '';
}

export async function recordPersonEulaAcceptance(store, db, { sessionId = '', session = null, receipt = null } = {}) {
  const version = clean(receipt?.eula?.version || session?.eula?.version, 120);
  const receiptSha256 = clean(receipt?.receiptSha256, 128);
  if (!store || !version || !receiptSha256) return null;
  const customerId = await resolvePersonCustomerId(db, { sessionId, session });
  if (!customerId) return null;
  const key = personEulaKey(customerId);
  const prior = (await store.getJson(key)) || {};
  const priorVersions = prior.versions && typeof prior.versions === 'object' ? prior.versions : {};
  const entry = {
    acceptedAt: receipt?.eula?.acceptedAt || new Date().toISOString(),
    acceptedByName: clean(receipt?.eula?.acceptedByName, 180) || '',
    sessionId: clean(sessionId || receipt?.eula?.onboardingSessionId, 180) || null,
    receiptSha256,
  };
  const next = {
    customerId,
    clientKey: personEulaClientKey(customerId),
    version,
    acceptedAt: entry.acceptedAt,
    acceptedByName: entry.acceptedByName,
    sessionId: entry.sessionId,
    receiptSha256,
    versions: {
      ...priorVersions,
      [version]: entry,
    },
  };
  await store.putJson(key, next);
  return next;
}

export async function hasPersonAcceptedEula(store, db, session, requiredVersion, seat = null) {
  const version = clean(requiredVersion, 120);
  const customerId = clean(session?.customer_id || session?.personCustomerId, 80);
  if (!store || !version || !customerId) return false;
  const personRecord = await store.getJson(personEulaKey(customerId));
  if (personRecord?.versions?.[version]?.receiptSha256) return true;
  if (personRecord?.version === version && personRecord?.receiptSha256) return true;

  const clientKeys = new Set([personEulaClientKey(customerId)]);
  if (session?.id) clientKeys.add(eulaClientKeyForOnboarding(session));
  if (seat?.inviteId) clientKeys.add(collaboratorEulaClientKey({ id: seat.inviteId }));
  if (db) {
    const sessions = await safeQuery(() => db`
      select id, metadata
      from onboarding_sessions
      where customer_id = ${customerId}
    `, []);
    for (const row of Array.isArray(sessions) ? sessions : []) {
      if (row?.id) clientKeys.add(eulaClientKeyForOnboarding(row));
      const invId = clean(row?.metadata?.seat?.inviteId, 80);
      if (invId) clientKeys.add(collaboratorEulaClientKey({ id: invId }));
    }
    const invites = await safeQuery(() => db`
      select id
      from vacation_collaborator_invites
      where metadata->>'collaboratorCustomerId' = ${customerId}
    `, []);
    for (const inv of Array.isArray(invites) ? invites : []) {
      if (inv?.id) clientKeys.add(collaboratorEulaClientKey({ id: inv.id }));
    }
  }
  const storedSessions = await store.listJson('sessions');
  const candidates = storedSessions
    .filter((item) => clientKeys.has(item?.clientKey) || clean(item?.personCustomerId, 80) === customerId)
    .sort((a, b) => String(b.acceptedAt || b.createdAt || '').localeCompare(String(a.acceptedAt || a.createdAt || '')));
  for (const candidate of candidates) {
    const receipt = await store.getJson(receiptKey(candidate.sessionId));
    const validation = validateReceiptForActivation({
      session: candidate,
      receipt,
      requiredEulaVersion: version,
    });
    if (validation.ok) return true;
  }
  return false;
}

async function collaboratorPersistentSession(store, invite, joined, env) {
  const sessionId = collaboratorEulaSessionId(invite);
  const stored = await store.getJson(sessionKey(sessionId));
  const returnUrl = vacationAppLink(joined.token, env);
  const version = env.TIMESYNCHER_EULA_VERSION || DEFAULT_EULA_VERSION;
  const personCustomerId = clean(joined?.customerId || invite?.metadata?.collaboratorCustomerId, 80) || null;
  if (stored && stored.eula?.version === version) {
    const needsReturnUpdate = stored.google?.returnUrl !== returnUrl;
    const needsCustomerUpdate = Boolean(personCustomerId && stored.personCustomerId !== personCustomerId);
    const next = (needsReturnUpdate || needsCustomerUpdate)
      ? {
        ...stored,
        ...(personCustomerId ? { personCustomerId } : {}),
        google: { ...(stored.google || {}), returnUrl },
      }
      : stored;
    if (next !== stored) await store.putJson(sessionKey(sessionId), next);
    const loaded = await loadSessionPersistent(store, sessionId);
    return loaded?.unavailableReason ? next : (loaded || next);
  }
  const contact = inviteContact(invite);
  const created = await createOnboardingSessionPersistent(store, {
    sessionId,
    clientKey: collaboratorEulaClientKey(invite),
    clientLabel: contact.displayName || 'Vacay Keepsake collaborator',
    contact: { email: contact.email, phone: null },
    personCustomerId,
    selectedFunctionality: [
      'vacation_planning_onboarding',
      'in_app_text_voice_and_file_intake',
      'hosted_itinerary_generation',
      'support_contact',
    ],
    google: { returnUrl },
    eula: {
      version,
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

export async function vacationAppEulaForCollaboratorSeat(session, seat, env = process.env, db = null) {
  const inviteId = clean(seat?.inviteId, 80);
  if (!inviteId) {
    return { accepted: false, status: 'missing', sessionId: null, version: null, text: '' };
  }
  const store = createPersistentStoreFromEnv(env);
  const eulaSessionId = collaboratorEulaSessionId({ id: inviteId });
  const version = env.TIMESYNCHER_EULA_VERSION || DEFAULT_EULA_VERSION;
  const personAccepted = await hasPersonAcceptedEula(store, db, session, version, seat);
  const stored = await store.getJson(sessionKey(eulaSessionId));
  const status = await activationStatusPersistent(store, collaboratorEulaClientKey({ id: inviteId }), version);
  const storedMatchesVersion = stored?.status === 'accepted' && stored?.eula?.version === version;
  const accepted = Boolean(personAccepted || status.ok || status.status === 'accepted' || storedMatchesVersion);
  const payload = {
    accepted,
    status: accepted ? 'accepted' : 'pending',
    sessionId: eulaSessionId,
    version: null,
    text: '',
  };
  if (accepted) return payload;
  if (db) await collaboratorSessionForAccept(store, db, eulaSessionId, env);
  const eulaSession = await loadSessionPersistent(store, eulaSessionId);
  payload.version = eulaSession?.eula?.version || version;
  payload.text = loadCollaboratorAppSeatEulaText(env);
  return payload;
}

export async function resolveVacationAppEula(db, session, env = process.env) {
  const seat = seatFromSession(session);
  if (seat?.inviteId) return vacationAppEulaForCollaboratorSeat(session, seat, env, db);
  const store = createPersistentStoreFromEnv(env);
  const ownerVersion = env.TIMESYNCHER_EULA_VERSION || '2026-04-initial-draft';
  if (await hasPersonAcceptedEula(store, db, session, ownerVersion, null)) {
    return {
      accepted: true,
      status: 'accepted',
      sessionId: session?.token ? eulaSessionIdForOnboarding(session) : null,
      version: null,
      text: '',
    };
  }
  const status = await vacationEulaStatus(session, env);
  const accepted = Boolean(status.ok || status.status === 'accepted');
  const payload = {
    accepted,
    status: accepted ? 'accepted' : (status.status || 'pending'),
    sessionId: status.sessionId || null,
    version: null,
    text: '',
  };
  if (accepted || !payload.sessionId) return payload;
  const eulaSession = await loadSessionPersistent(store, payload.sessionId);
  payload.version = eulaSession?.eula?.version || null;
  payload.text = eulaSession?.eula?.text || '';
  return payload;
}
