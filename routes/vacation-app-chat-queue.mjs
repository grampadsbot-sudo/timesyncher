import { cleanText } from '../src/vacation/http.mjs';
import { classifyTurn, classifyTurnWithModel } from '../src/vacation/turn-tags.mjs';
import { configuredSeatDollars } from '../src/vacation/seat-price.mjs';
import { customerModality, jevStamp, liveTurnRecord, firstMarkedIntake, produceLiveAppReply } from '../src/vacation/live-app-turn.mjs';
import { produceNoTripStarterReply } from '../src/vacation/no-trip-starter-reply.mjs';
import { loadVacationAppReplyRules } from '../scripts/vacation-app-reply-rules.mjs';
import { applyLiveAppReplyFailureToPayload, persistVacationAppOutboundReply, storeReplyFailure } from '../src/vacation/reply-ship.mjs';
import { tripIntakeJobFields } from '../src/vacation/trip-intake-classify.mjs';
import { tripIntakeJobKind } from '../src/vacation/vacation-from-chat-intake.mjs';
import { intakeExtractedThings, runVacationAppInTurnSearch } from '../src/vacation/chat-place-search.mjs';
import { seatFromSession, transcriptCustomerId } from '../src/vacation/collaborator-app-seat.mjs';
import { blockVacationAppReplyIdCitation } from '../src/vacation/reply-id-citation.mjs';
import { activeCollaboratorsFromDialogParty, blockVacationAppReplyActionClaim } from '../src/vacation/reply-action-claim.mjs';
import { runVacationAppTurnActions } from '../src/vacation/vacation-app-turn-actions.mjs';
import { loadOwnerReplyPlanForTurn } from '../src/vacation/reply-plan-entitlement.mjs';
import { placeSearchClientError } from '../src/vacation/place-search-reply-facts.mjs';

export async function queueVacationAppTurn(db, session, trip, body, hooks, intake = {}) {
  const env = process.env;
  const tripId = trip?.id ?? null;
  const started = Date.now();
  const text = cleanText(intake.requestText || body.text || body.message, 12000);
  const attachments = Array.isArray(body.attachments)
    ? body.attachments.slice(0, 20).map((item) => ({
      name: cleanText(item?.name, 240),
      type: cleanText(item?.type, 160),
      size: Number.parseInt(item?.size || '0', 10) || 0,
      lastModified: Number.parseInt(item?.lastModified || '0', 10) || null,
      inline: Boolean(item?.inline),
      contentDataUrl: cleanText(item?.contentDataUrl, 3_000_000) || null,
      note: cleanText(item?.note, 240) || null,
    }))
    : [];
  if (!text && attachments.length === 0) {
    throw Object.assign(new Error('Message text or an attachment is required.'), { statusCode: 400 });
  }

  const requestText = text || `Uploaded ${attachments.length} vacation file${attachments.length === 1 ? '' : 's'}.`;
  const modality = customerModality(body);
  const seat = seatFromSession(session);
  if (!seat && tripId) {
    const holder = [session.first_name, session.last_name].filter(Boolean).join(' ') || session.display_name || '';
    if (holder) {
      await db`
        update trips
        set metadata = jsonb_set(
          coalesce(metadata, '{}'::jsonb),
          '{dialogParty,primary}',
          ${JSON.stringify({ name: holder, role: 'Owner' })}::jsonb,
          true
        ),
          updated_at = now()
        where id = ${tripId}
          and coalesce(metadata#>>'{dialogParty,primary,name}', '') = ''
      `;
    }
  }
  const transcriptOwnerId = transcriptCustomerId(session);
  const speakerName = seat?.displayName || [session.first_name, session.last_name].filter(Boolean).join(' ') || session.display_name || '';
  const prior = tripId
    ? await db`
      select count(*)::int as n,
        min(coalesce(received_at, created_at)) as started_at
      from transcript_turns
      where customer_id = ${transcriptOwnerId}
        and trip_id = ${tripId}
        and channel = 'vacation-app'
        and payload->'liveTranscript' is not null
    `
    : await db`
      select count(*)::int as n,
        min(coalesce(received_at, created_at)) as started_at
      from transcript_turns
      where customer_id = ${transcriptOwnerId}
        and trip_id is null
        and channel = 'vacation-app'
        and payload->'liveTranscript' is not null
    `;
  const priorCount = Number(prior[0]?.n || 0);
  const sessionStartedMs = prior[0]?.started_at ? new Date(prior[0].started_at).getTime() : started;
  const sessionE2eMs = () => Math.max(1, Date.now() - (Number.isFinite(sessionStartedMs) ? sessionStartedMs : started));
  const customerTurnIndex = priorCount + 1;
  const receivedAt = new Date().toISOString();
  const memoryRows = tripId
    ? await db`
      select speaker, body, payload
      from transcript_turns
      where customer_id = ${transcriptOwnerId}
        and trip_id = ${tripId}
        and channel = 'vacation-app'
        and payload->'liveTranscript' is not null
      order by coalesce(received_at, sent_at, created_at) desc
      limit 120
    `
    : await db`
      select speaker, body, payload
      from transcript_turns
      where customer_id = ${transcriptOwnerId}
        and trip_id is null
        and channel = 'vacation-app'
        and payload->'liveTranscript' is not null
      order by coalesce(received_at, sent_at, created_at) desc
      limit 120
    `;
  const priorTurns = [...memoryRows].reverse().map((row) => {
    const stored = row.payload && typeof row.payload === 'object' ? row.payload : {};
    const live = stored.liveTranscript && typeof stored.liveTranscript === 'object' ? stored.liveTranscript : {};
    return {
      role: row.speaker === 'app' ? 'app' : 'customer',
      text: row.body || '',
      intake: live.intake === true,
    };
  });
  const classification = intake.classification;
  const placeSearchTurn = intake.placeSearchTurn;
  const webResearchTurn = intake.webResearchTurn;
  if (!classification) throw new Error('vacation app queue intake classification is required');
  const firstIntake = firstMarkedIntake({ text: requestText, intake: classification.ok === true && classification.intake === true }, priorTurns);
  const queuedJobType = tripIntakeJobKind();
  const jobFields = tripIntakeJobFields({
    requestText,
    receivedAt,
    classification,
    firstIntake,
    jobKind: queuedJobType,
  });
  const customerLive = liveTurnRecord({
    turnIndex: customerTurnIndex,
    role: 'customer',
    modality,
    text: requestText,
    at: receivedAt,
    latencyMs: Date.now() - started,
    sessionE2eMs: sessionE2eMs(),
    jev: { jevRan: false, error: 'classify_pending' },
    speakerName,
    intake: classification.ok === true && classification.intake === true,
  });
  const payload = {
    source: 'vacation_app',
    surface: 'vacation-app',
    attachments,
    voiceMode: modality === 'voice',
    browserTranscription: Boolean(body.browserTranscription) && modality === 'voice',
    selectedTripId: tripId || null,
    liveTranscript: customerLive,
    authorName: speakerName,
    authorId: session.customer_id || null,
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
  };
  const turnTag = (tripId && (placeSearchTurn || webResearchTurn))
    ? classifyTurn({
      text: requestText,
      speaker: 'customer',
      direction: 'inbound',
      channel: 'vacation-app',
      payload,
    })
    : await classifyTurnWithModel({
      text: requestText,
      speaker: 'customer',
      direction: 'inbound',
      channel: 'vacation-app',
      payload,
    });
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
  const intakeLatency = Date.now() - started;
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

  let placeResults = [], enforceInTurnSearch = false, activeWebResearchTurn = webResearchTurn, placeSearchReplyFacts = null;
  if (tripId) {
    const inTurnSearch = await runVacationAppInTurnSearch({
      db,
      tripId,
      requestId,
      customerTurn: requestText,
      tripDestination: cleanText(trip?.destination || '', 180),
      classification,
      payload,
      customerLive,
      turnId: turnRows[0].id,
      env,
      publishShare: hooks.publishIntakeShare,
      workerJobId: jobRows[0].id,
      workerJobContext: placeSearchTurn ? {
        customerId: transcriptOwnerId,
        tripId,
        requestId,
        queuedJobType,
        requestText,
        payload,
        jobFields,
      } : null,
      placeSearchTurn,
      webResearchTurn,
    });
    if (!inTurnSearch.ok) {
      const failedLatency = Date.now() - started;
      return {
        requestId,
        jobId: jobRows[0].id,
        receivedAt: requestRows[0].received_at,
        queuedAt: requestRows[0].queued_at,
        turnTag,
        modality,
        turnIndex: customerTurnIndex,
        latencyMs: failedLatency,
        sessionE2eMs: sessionE2eMs(),
        jev: customerLive.jev,
        reply: null,
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
        ok: false,
        status: inTurnSearch.status,
        error: placeSearchClientError(inTurnSearch.placeSearch, inTurnSearch.error),
        placeSearch: inTurnSearch.placeSearch,
        webSearch: inTurnSearch.webSearch,
      };
    }
    placeResults = inTurnSearch.inTurnProviderResults || [];
    enforceInTurnSearch = inTurnSearch.enforceInTurnSearch;
    activeWebResearchTurn = inTurnSearch.webResearchTurn;
    if (inTurnSearch.placeSearchReplyFacts) {
      placeSearchReplyFacts = inTurnSearch.placeSearchReplyFacts;
      payload.placeSearchReplyFacts = customerLive.placeSearchReplyFacts = placeSearchReplyFacts;
    }
  }

  let turnActionResults = {};
  if (!seat) {
    turnActionResults = await runVacationAppTurnActions({
      db,
      session,
      tripId,
      requestText,
      roster: Array.isArray(classification.roster) ? classification.roster : [],
      env,
    });
    payload.turnActionResults = turnActionResults;
    customerLive.turnActionResults = turnActionResults;
    await db`
      update transcript_turns
      set payload = ${payload}
      where id = ${turnRows[0].id}
    `;
  }

  let produced;
  try {
    const loadOwnerPlan = async (opts) => loadOwnerReplyPlanForTurn({
      session: opts?.session ?? session,
      tripId: opts?.tripId,
      env: opts?.env ?? env,
      db,
    });
    if (!tripId) {
      const rules = await loadVacationAppReplyRules(env);
      produced = await produceNoTripStarterReply({
        customerTurn: requestText,
        session,
        env: env,
        rules,
        loadOwnerPlan,
        turnActionResults,
      });
    } else {
      produced = await produceLiveAppReply({
        customerTurn: requestText,
        session: { ...session, trip_id: tripId },
        priorTurns,
        tripTitle: trip?.title || '',
        placeResults,
        placeSearchTurn: enforceInTurnSearch,
        webResearchTurn: activeWebResearchTurn,
        env: env,
        seatDollars: configuredSeatDollars(env),
        intake: classification.ok === true && classification.intake === true,
        wantedThings: intakeExtractedThings(placeSearchTurn, classification, webResearchTurn),
        roster: Array.isArray(classification.roster) ? classification.roster : [],
        rosterError: classification.ok === true ? null : (classification.error || 'trip intake classification failed'),
        extractedDestination: jobFields.destination,
        extractedTitle: jobFields.title,
        destinationError: jobFields.destinationError,
        titleError: jobFields.titleError,
        savedStart: jobFields.startDate,
        savedEnd: jobFields.endDate,
        loadOwnerPlan,
        turnActionResults,
        placeSearchReplyFacts,
      });
    }
  } catch (error) {
    produced = {
      reply: null,
      rules: null,
      jev: { jevRan: false, error: error?.message || 'live dispatcher failed' },
      model: null,
      reason: error?.message || 'live dispatcher failed',
    };
  }
  customerLive.jev = jevStamp(produced.jev);
  customerLive.rules = produced.rules
    ? { ok: Boolean(produced.rules.ok), via: produced.rules.via || null, slug: produced.rules.slug || null }
    : null;
  payload.liveTranscript = customerLive;
  await db`
    update transcript_turns
    set payload = ${payload}
    where id = ${turnRows[0].id}
  `;

  const exchangeLatency = Date.now() - started;
  const base = {
    requestId,
    jobId: jobRows[0].id,
    receivedAt: requestRows[0].received_at,
    queuedAt: requestRows[0].queued_at,
    turnTag,
    modality,
    turnIndex: customerTurnIndex,
    latencyMs: exchangeLatency,
    sessionE2eMs: sessionE2eMs(),
    jev: customerLive.jev,
    reply: null,
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
    placeSearch: customerLive.placeSearch ?? payload.placeSearch ?? null,
    webSearch: customerLive.webSearch ?? payload.webSearch ?? null,
    turnActionResults,
  };
  const replyClaimContext = { activeCollaborators: activeCollaboratorsFromDialogParty(trip) };
  const blockReplyShipGate = async (replyText) => {
    const actionBlocked = await blockVacationAppReplyActionClaim({
      replyText,
      tripId,
      turnActionResults,
      replyClaimContext,
      db,
      turnId: turnRows[0].id,
      payload,
      customerLive,
      base,
      storeReplyFailure,
    });
    if (actionBlocked) return actionBlocked;
    return blockVacationAppReplyIdCitation({
      replyText,
      tripId,
      db,
      turnId: turnRows[0].id,
      payload,
      customerLive,
      base,
      storeReplyFailure,
    });
  };
  if (produced.status === 'interim' && produced.pending) {
    const interimBlocked = await blockReplyShipGate(produced.interimReply?.text || '');
    if (interimBlocked) return interimBlocked;
    const pending = {
      ...produced.pending,
      customerTurnIndex,
      customerTurnId: turnRows[0].id,
      requestId,
      speakerName,
      collaborator: Boolean(seat),
      tripId,
      turnActionResults,
      sessionStartedMs,
      wallStarted: started,
    };
    await db`
      update onboarding_sessions
      set metadata = coalesce(metadata, '{}'::jsonb) || ${{ pendingRewrite: pending }},
        updated_at = now()
      where id = ${session.id}
    `;
    return {
      ...base,
      ok: true,
      status: 'interim',
      interimReply: produced.interimReply,
      reply: produced.interimReply?.text || '',
      error: null,
    };
  }
  if (!produced.reply) {
    const failure = applyLiveAppReplyFailureToPayload(payload, customerLive, produced);
    await storeReplyFailure(db, turnRows[0].id, payload);
    return { ...base, ok: false, status: failure.failureStatus, error: failure.replyFailure, invented: failure.invented };
  }

  const citationBlocked = await blockReplyShipGate(produced.reply);
  if (citationBlocked) return citationBlocked;

  return persistVacationAppOutboundReply({
    db,
    transcriptOwnerId,
    tripId,
    requestId,
    jobId: jobRows[0].id,
    produced,
    base,
    exchangeLatency,
    sessionE2eMs: sessionE2eMs(),
    customerTurnIndex,
    speakerName,
    seat,
    classification,
    jobFields,
    firstIntake,
    requestText,
    intakeThings: intakeExtractedThings(placeSearchTurn, classification),
    customerTurnId: turnRows[0].id,
    recordCustomerThingNotes: hooks.recordCustomerThingNotes,
    publishIntakeShare: hooks.publishIntakeShare,
    vacationAppTripSummary: hooks.vacationAppTripSummary,
  });
}
