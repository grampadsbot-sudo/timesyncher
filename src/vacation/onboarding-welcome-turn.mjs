export async function onboardingWelcomeTurnExists(db, { customerId, tripId, welcomeAudience }) {
  if (!customerId || !welcomeAudience) return false;
  const rows = tripId
    ? await db`
      select id
      from transcript_turns
      where customer_id = ${customerId}
        and (trip_id = ${tripId} or trip_id is null)
        and channel in ('vacation-app', 'vacation_app')
        and speaker = 'app'
        and direction = 'outbound'
        and payload->>'welcomeAudience' = ${welcomeAudience}
      limit 1
    `
    : await db`
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
  return rows.length > 0;
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
