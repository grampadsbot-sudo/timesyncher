export function onboardingWelcomeTranscriptCustomerId(session, seat) {
  if (seat) return String(session?.customer_id || '').trim();
  return String(session?.customer_id || '').trim();
}

async function selectWelcomeTurnId(db, { customerId, tripId, welcomeAudience }) {
  if (welcomeAudience === 'collaborator') {
    const rows = await db`
      select id
      from transcript_turns
      where customer_id = ${customerId}
        and channel in ('vacation-app', 'vacation_app')
        and speaker = 'app'
        and direction = 'outbound'
        and (
          payload->>'welcomeAudience' = 'collaborator'
          or payload->>'welcomeAudience' = 'collaborator_no_site'
        )
      limit 1
    `;
    return rows[0]?.id || null;
  }
  if (tripId) {
    const rows = await db`
      select id
      from transcript_turns
      where customer_id = ${customerId}
        and (trip_id = ${tripId} or trip_id is null)
        and channel in ('vacation-app', 'vacation_app')
        and speaker = 'app'
        and direction = 'outbound'
        and payload->>'welcomeAudience' = ${welcomeAudience}
      limit 1
    `;
    return rows[0]?.id || null;
  }
  const rows = await db`
    select id
    from transcript_turns
    where customer_id = ${customerId}
      and trip_id is null
      and channel in ('vacation-app', 'vacation_app')
      and speaker = 'app'
      and direction = 'outbound'
      and payload->>'welcomeAudience' = ${welcomeAudience}
    limit 1
  `;
  return rows[0]?.id || null;
}

export async function onboardingWelcomeTurnExists(db, { customerId, tripId, welcomeAudience }) {
  if (!customerId || !welcomeAudience) return false;
  return Boolean(await selectWelcomeTurnId(db, { customerId, tripId, welcomeAudience }));
}

export async function releaseOnboardingWelcomeClaim(db, { onboardingSessionId, welcomeFor }) {
  if (!onboardingSessionId || !welcomeFor) return;
  await db`
    delete from vacation_onboarding_welcomes
    where onboarding_session_id = ${onboardingSessionId}
      and welcome_for = ${welcomeFor}
  `;
}

export async function loadCollaboratorWelcomeTranscriptRows(db, welcomeCustomerId, tripKey) {
  if (!welcomeCustomerId) return [];
  return tripKey
    ? await db`
      select speaker, body, channel, payload, direction, received_at, sent_at, created_at
      from transcript_turns
      where customer_id = ${welcomeCustomerId}
        and (trip_id = ${tripKey} or trip_id is null)
        and channel in ('vacation-app', 'vacation_app')
        and speaker = 'app'
        and direction = 'outbound'
        and (
          payload->>'welcomeAudience' = 'collaborator'
          or payload->>'welcomeAudience' = 'collaborator_no_site'
        )
      order by coalesce(received_at, sent_at, created_at) desc nulls last
      limit 10
    `
    : await db`
      select speaker, body, channel, payload, direction, received_at, sent_at, created_at
      from transcript_turns
      where customer_id = ${welcomeCustomerId}
        and trip_id is null
        and channel in ('vacation-app', 'vacation_app')
        and speaker = 'app'
        and direction = 'outbound'
        and (
          payload->>'welcomeAudience' = 'collaborator'
          or payload->>'welcomeAudience' = 'collaborator_no_site'
        )
      order by coalesce(received_at, sent_at, created_at) desc nulls last
      limit 10
    `;
}

export async function bindPreTripOnboardingWelcome(db, {
  customerId,
  tripId,
  welcomeAudience,
  welcomeFor,
  onboardingSessionId,
}) {
  if (!tripId || !customerId || !welcomeAudience || !onboardingSessionId) return;
  await db`
    update vacation_onboarding_welcomes
    set trip_id = ${tripId}
    where onboarding_session_id = ${onboardingSessionId}
      and welcome_for = ${welcomeFor}
      and trip_id is null
  `;
  if (welcomeAudience === 'collaborator') {
    await db`
      update transcript_turns
      set trip_id = ${tripId},
          payload = coalesce(payload, '{}'::jsonb) || ${{ selectedTripId: tripId }}
      where customer_id = ${customerId}
        and trip_id is null
        and channel in ('vacation-app', 'vacation_app')
        and speaker = 'app'
        and direction = 'outbound'
        and (
          payload->>'welcomeAudience' = 'collaborator'
          or payload->>'welcomeAudience' = 'collaborator_no_site'
        )
    `;
    return;
  }
  await db`
    update transcript_turns
    set trip_id = ${tripId},
        payload = coalesce(payload, '{}'::jsonb) || ${{ selectedTripId: tripId }}
    where customer_id = ${customerId}
      and trip_id is null
      and channel in ('vacation-app', 'vacation_app')
      and speaker = 'app'
      and direction = 'outbound'
      and payload->>'welcomeAudience' = ${welcomeAudience}
  `;
}
