export async function persistVacationAppCustomerTurn(db, {
  transcriptOwnerId,
  tripId,
  queuedJobType,
  requestText,
  payload,
  turnTag,
  jobFields,
  customerTurnIndex,
  intakeLatency,
} = {}) {
  const requestRows = await db`
    insert into vacation_requests (
      customer_id, trip_id, source, request_type, request_text, normalized_intent, payload,
      status, queued_at
    )
    values (
      ${transcriptOwnerId}, ${tripId}, 'vacation-app', ${queuedJobType}, ${requestText},
      ${{ turnTag }}, ${payload}, 'queued', now()
    )
    returning id, received_at, queued_at
  `;
  const requestId = requestRows[0].id;
  const turnRows = await db`
    insert into transcript_turns (
      customer_id, trip_id, request_id, speaker, channel, body, payload, direction,
      received_at, response_latency_ms,
      turn_category, turn_tags, turn_tag_source, turn_tag_confidence, turn_tagged_at
    )
    values (
      ${transcriptOwnerId}, ${tripId}, ${requestId}, 'customer', 'vacation-app', ${requestText}, ${payload}, 'inbound',
      now(), ${intakeLatency},
      ${turnTag.category}, ${turnTag.tags}, ${turnTag.source}, ${turnTag.confidence}, now()
    )
    returning id
  `;
  await db`
    insert into vacation_request_events (request_id, event_type, actor, details)
    values
      (${requestId}, 'received', 'customer', ${payload}),
      (${requestId}, 'queued', 'system', ${{ surface: 'vacation-app', turnTag }})
  `;
  const jobRows = await db`
    insert into worker_jobs (request_id, trip_id, job_type, input)
    values (${requestId}, ${tripId}, ${queuedJobType}, ${{
      customerId: transcriptOwnerId,
      tripId,
      requestId,
      source: 'vacation-app',
      requestType: queuedJobType,
      requestText,
      payload,
      intakeEvent: jobFields.intakeEvent,
      wantedThings: jobFields.wantedThings,
      roster: jobFields.roster,
      rosterError: jobFields.rosterError,
      destination: jobFields.destination,
      hasDates: jobFields.hasDates,
      startDate: jobFields.startDate,
      endDate: jobFields.endDate,
      title: jobFields.title,
      titleError: jobFields.titleError,
      intakeError: jobFields.intakeError,
    }})
    returning id
  `;
  return {
    requestId,
    requestRow: requestRows[0],
    customerTurnId: turnRows[0].id,
    jobId: jobRows[0].id,
  };
}
