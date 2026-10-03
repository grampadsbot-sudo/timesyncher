import { seatFromSession, transcriptCustomerId } from './collaborator-app-seat.mjs';
import {
  loadCollaboratorWelcomeTranscriptRows,
  onboardingWelcomeTranscriptCustomerId,
} from './onboarding-welcome-turn.mjs';
import { appReplyTelemetry } from './reply-telemetry.mjs';
import { vacationAppTurnPayloadForClient } from './reply-ship.mjs';
import { transcriptAuthorMissingError, turnAuthorLabel } from './turn-author.mjs';

function mapVacationAppTurnRows(rows, { session, customerId, tripKey, people }) {
  const labelSession = { ...session, viewerId: session.viewerId || session.customer_id || null };
  return rows.reverse().map((row) => {
    const payload = row.payload && typeof row.payload === 'object' ? row.payload : {};
    const clientPayload = vacationAppTurnPayloadForClient(payload);
    const live = clientPayload.liveTranscript && typeof clientPayload.liveTranscript === 'object' ? clientPayload.liveTranscript : {};
    const inbound = row.speaker === 'customer' || row.direction === 'inbound';
    const turn = {
      speaker: row.speaker || 'customer',
      body: row.body || '',
      channel: row.channel || '',
      direction: row.direction || '',
      payload: clientPayload,
      authorName: String(clientPayload.authorName || live.speakerName || ''),
      authorId: (() => {
        const explicit = String(clientPayload.authorId || '').trim();
        if (explicit) return explicit;
        const spoken = String(clientPayload.authorName || live.speakerName || '').trim();
        if (inbound && !spoken) return String(customerId);
        return '';
      })(),
      at: row.received_at || row.sent_at || row.created_at || null,
    };
    const named = turnAuthorLabel(turn, labelSession, people);
    turn.authorLabel = named.label;
    if (named.reason) turn.authorLabelReason = named.reason;
    if (named.reason === 'author_name_missing' && inbound) {
      const missing = transcriptAuthorMissingError(turn, labelSession, tripKey);
      console.error(JSON.stringify(missing));
      throw Object.assign(new Error('transcript_author_missing'), { code: 'transcript_author_missing', details: missing });
    }
    if (row.speaker === 'app' || live.role === 'app') Object.assign(turn, appReplyTelemetry(live));
    return turn;
  });
}

export async function loadTripScopedVacationAppTurns(db, session, tripId, { loadTranscriptAuthorPeople }) {
  const partyCustomerId = transcriptCustomerId(session);
  if (!partyCustomerId) return [];
  const tripKey = tripId || null;
  const people = await loadTranscriptAuthorPeople(db, partyCustomerId, tripKey);
  const seat = seatFromSession(session);
  const welcomeCustomerId = onboardingWelcomeTranscriptCustomerId(session, seat);
  const rows = tripKey
    ? await db`
      select speaker, body, channel, payload, direction, received_at, sent_at, created_at
      from transcript_turns
      where trip_id = ${tripKey}
        and channel in ('vacation-app', 'vacation_app', 'telegram_vacation_bot', 'telegram_vacation_media')
      order by coalesce(received_at, sent_at, created_at) desc nulls last
      limit 120
    `
    : await db`
      select speaker, body, channel, payload, direction, received_at, sent_at, created_at
      from transcript_turns
      where customer_id = ${partyCustomerId}
        and trip_id is null
        and channel in ('vacation-app', 'vacation_app', 'telegram_vacation_bot', 'telegram_vacation_media')
      order by coalesce(received_at, sent_at, created_at) desc nulls last
      limit 120
    `;
  let merged = rows;
  if (seat && welcomeCustomerId && welcomeCustomerId !== partyCustomerId && tripKey) {
    const welcomeRows = await loadCollaboratorWelcomeTranscriptRows(db, welcomeCustomerId, tripKey);
    const seen = new Set(rows.map((row) => `${row.body}|${row.received_at}|${row.sent_at}`));
    const extra = welcomeRows.filter((row) => !seen.has(`${row.body}|${row.received_at}|${row.sent_at}`));
    merged = [...rows, ...extra];
    merged.sort((a, b) => {
      const atA = a.received_at || a.sent_at || a.created_at;
      const atB = b.received_at || b.sent_at || b.created_at;
      return new Date(atA).getTime() - new Date(atB).getTime();
    });
  }
  return mapVacationAppTurnRows(merged, { session, customerId: partyCustomerId, tripKey, people });
}
