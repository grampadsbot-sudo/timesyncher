import { openCollaboratorAppSeats } from '../../src/vacation/collaborator-app-seat.mjs';
import { collaboratorEulaSessionId } from '../../src/vacation/collaborators.mjs';
import { queueOrSendWebEditorInviteEmail } from '../../src/vacation/email.mjs';
import { harnessOutboundEmailAllowed } from '../../src/vacation/email-harness-outbound.mjs';
import { createWebEditorInvite, publicTripUrl } from '../../src/vacation/web-access.mjs';
import { saveReviewArtifact, vkAdminStorage } from '../../src/vacation/vk-admin-review-storage.mjs';
import { STAGING_HARNESS_ORIGIN } from './env.mjs';
import { captureInviteOnboarding } from './onboarding-capture.mjs';
import { assertOnboardingCustomer, refusedOnboardingTarget } from './onboarding-screens.mjs';
import { assertThrowaway, isHarnessTag } from './protected.mjs';
import { shortHash } from './redact.mjs';

function assertInvitee({ name, email }, { stored = false } = {}) {
  assertOnboardingCustomer({ name, email });
  if (stored && harnessOutboundEmailAllowed(email, { TIMESYNCHER_HARNESS_STUB_OUTBOUND: '1' })) return;
  if (!/^[a-z0-9._+-]+@(?:harness\.invalid|example\.test)$/i.test(email)) {
    throw new Error('refused: invitation requires a throwaway inbox');
  }
}

function plannedInvitees(party, tripId) {
  return [['telegram_collaborator', party.collaborators], ['web_editor', party.editors]]
    .flatMap(([role, people = []]) => people.map((person, index) => {
      const name = String(person.name || person.displayName || '').trim();
      const explicit = String(person.email || '').trim().toLowerCase();
      const email = explicit || `harness+${shortHash(tripId)}+${role}+${index + 1}@harness.invalid`;
      return { role, name, email, explicit };
    }));
}

async function storedInvites(db, tripId) {
  return db`
    select distinct on (mail.role, mail.invite_id) mail.*
    from (
      select 'telegram_collaborator' as role, i.id as invite_id, i.requested_for as name,
        e.to_email as email, e.subject, e.html_body as html, e.status, e.created_at, e.id
      from vacation_collaborator_invites i join outbound_emails e
        on e.metadata->>'collaboratorInviteId' = i.id::text and e.customer_id = i.owner_customer_id
      where i.trip_id = ${tripId}
      union all
      select 'web_editor' as role, g.id as invite_id, g.display_name as name,
        e.to_email as email, e.subject, e.html_body as html, e.status, e.created_at, e.id
      from vacation_web_access_grants g join outbound_emails e
        on e.metadata->>'webAccessGrantId' = g.id::text and e.customer_id = g.owner_customer_id
      where g.trip_id = ${tripId} and g.role = 'web_editor' and g.metadata->>'collaboratorInviteId' is null
    ) mail
    order by mail.role, mail.invite_id, mail.created_at desc, mail.id desc
  `;
}

function hasStoredInvite(invites, person) {
  return invites.some((invite) => invite.role === person.role && (invite.email === person.email
    || (!person.explicit && invite.name?.toLowerCase() === person.name.toLowerCase())));
}

async function issueInvite(db, person, { ownerCustomerId, tripId, env }) {
  assertInvitee(person);
  if (person.role === 'telegram_collaborator') {
    await openCollaboratorAppSeats(db, { ownerCustomerId, tripId, seats: [person], env });
  } else {
    const invite = await createWebEditorInvite(db, { ownerCustomerId, tripId, email: person.email, displayName: person.name, env });
    await queueOrSendWebEditorInviteEmail(db, invite, env);
  }
}

async function tagJoinedCollaborator(db, tripId, tag, invite) {
  const eulaSessionId = collaboratorEulaSessionId({ id: invite.invite_id });
  await db`
    with guest as (
      update customers
      set metadata = metadata || ${{ harnessTag: tag }}
      where lower(email) = ${invite.email.toLowerCase()}
        and metadata->>'source' = 'collaborator_app_seat'
        and metadata->>'inviteId' = ${invite.invite_id}
      returning id
    )
    update onboarding_sessions
    set metadata = metadata || ${{ harnessTag: tag, eulaSessionId }}
    where trip_id = ${tripId} and metadata->'seat'->>'inviteId' = ${invite.invite_id}
      and customer_id in (select id from guest)
  `;
}

export async function captureVacationInviteOnboarding({
  db, story, ownerCustomerId, tripId, tag, origin, env, outDir, openPage, put, issuePlanned = true,
  openStore = () => vkAdminStorage(env),
}) {
  const uploaded = [];
  const errors = [];
  if (!story.coupon) return { uploaded, errors };
  if (origin !== STAGING_HARNESS_ORIGIN || !isHarnessTag(tag)) throw new Error('refused: invite onboarding requires a staging harness run');
  const [trip] = await db`
    select title, metadata from trips
    where id = ${tripId} and customer_id = ${ownerCustomerId} and metadata->>'harnessTag' = ${tag}
  `;
  if (!trip) throw new Error('refused: invite onboarding vacation does not match the harness run');
  const write = put || (async (_vacationId, artifact, bytes) => {
    if (!await saveReviewArtifact(openStore(), tripId, artifact, bytes.toString('base64'))) {
      throw new Error('invalid onboarding capture');
    }
  });
  const staging = {
    ...env, TIMESYNCHER_SITE_BASE_URL: origin, TIMESYNCHER_TRAVEL_BASE_URL: origin,
    TIMESYNCHER_HARNESS_STUB_OUTBOUND: '1',
  };
  const sharedUrl = publicTripUrl(trip, staging);
  const shared = new URL(sharedUrl);
  assertThrowaway({ tripId, shareToken: shared.pathname, displayName: trip.title });
  if (shared.origin !== origin || !/^\/shared\/[^/]+\/?$/.test(shared.pathname)
    || refusedOnboardingTarget(sharedUrl) || /santa barbara/i.test(trip.title)) {
    throw new Error('refused: invite onboarding shared vacation');
  }
  const party = story.party || {};
  let invites = await storedInvites(db, tripId);
  if (issuePlanned && story.steps?.includes('collaborator')) {
    const planned = plannedInvitees(party, tripId);
    const missing = planned.filter((person) => !hasStoredInvite(invites, person));
    for (const person of missing) {
      try {
        await issueInvite(db, person, { ownerCustomerId, tripId, env: staging });
      } catch {
        errors.push(`${person.role}-invite-issue-failed`);
      }
    }
    if (missing.length) invites = await storedInvites(db, tripId);
    for (const person of missing.filter((person) => !hasStoredInvite(invites, person))) {
      errors.push(`${person.role}-stored-invite-missing`);
    }
  }
  if (party.viewers?.some((viewer) => !viewer.email)) invites.push({ role: 'viewer', invite_id: 'shared' });
  for (const invite of invites) {
    const args = {
      invite, origin, sharedUrl, title: trip.title, vacationId: tripId, guest: shortHash(invite.invite_id), outDir, put: write, openPage,
    };
    try {
      if (invite.role !== 'viewer') {
        assertInvitee(invite, { stored: true });
        if (!invite.html || !['sent', 'stubbed'].includes(invite.status)) {
          errors.push(`${invite.role}-stored-invite-missing`);
          continue;
        }
      }
      const result = await captureInviteOnboarding(args);
      uploaded.push(...result.uploaded);
      if (result.error) errors.push(result.error);
      if (invite.role === 'telegram_collaborator') await tagJoinedCollaborator(db, tripId, tag, invite);
    } catch {
      errors.push(`${invite.role}-onboarding-capture-failed`);
    }
  }
  return { uploaded, errors };
}
