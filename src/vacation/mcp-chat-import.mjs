import { cleanText, headerValue } from './http.mjs';
import { seatFromSession, transcriptCustomerId } from './collaborator-app-seat.mjs';
import { createMcpToken } from './mcp-tokens.mjs';
import { asArray, asObject, vacationShareSlugForRow } from './mcp-read.mjs';

const AI_ACTOR_RE = /\b(my\s+ai|an?\s+ai|ai\s+assistant|ai\s+agent|ai\s+tool|my\s+assistant|personal\s+assistant|my\s+bot|chatgpt|chat\s*gpt|claude|gemini|grok|copilot|perplexity|openclaw|mcp)\b/i;
const IMPORT_ACTION_RE = /\b(import|bring|pull|load|send|push|sync|upload|transfer|connect|link|hook\s+up|paste|copy|add|share|give|get|set\s+up|setup|handoff|instructions?|token|access)\b/i;
const DIRECT_IMPORT_FROM_AI_RE = /\b(import|bring|pull|load|send|push|sync|upload|transfer)\b[\s\S]{0,80}\b(ai|assistant|chatgpt|chat\s*gpt|claude|gemini|grok|copilot|perplexity|openclaw|mcp)\b/i;
const FROM_AI_RE = /\b(from|with|via|using|into|to)\s+(?:my\s+|an?\s+|the\s+)?(ai|assistant|chatgpt|chat\s*gpt|claude|gemini|grok|copilot|perplexity|openclaw|mcp)\b/i;
const VACATION_DOMAIN_RE = /\b(vacation|itinerary|plans?|details?|schedule|photos?|hotels?|flights?|restaurants?|activities|stuff|info|notes?|data)\b/i;
const REVOKE_ONLY_RE = /\b(revoke|remove|delete|disable|turn\s+off)\b/i;

export function isAiImportChatRequest(rawText = '') {
  const text = cleanText(rawText, 2000);
  if (!text) return false;
  if (REVOKE_ONLY_RE.test(text) && !/\b(import|connect|new\s+token|handoff)\b/i.test(text)) return false;
  if (DIRECT_IMPORT_FROM_AI_RE.test(text)) return true;
  if (AI_ACTOR_RE.test(text) && IMPORT_ACTION_RE.test(text)) return true;
  if (FROM_AI_RE.test(text) && (VACATION_DOMAIN_RE.test(text) || IMPORT_ACTION_RE.test(text))) return true;
  return false;
}

export function maskMcpToken(rawToken = '') {
  const token = cleanText(rawToken, 300);
  if (!token) return 'vkm_••••••••••••';
  const visible = token.slice(0, 10);
  return `${visible}••••••••••••`;
}

function resolveMcpEndpointUrl(req = null, env = process.env) {
  const host = req ? cleanText(headerValue(req, 'x-forwarded-host') || headerValue(req, 'host'), 200) : '';
  if (host) {
    const proto = cleanText(headerValue(req, 'x-forwarded-proto'), 20) || (/^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(host) ? 'http' : 'https');
    return `${proto}://${host}/api/mcp`;
  }
  const base = String(env.TIMESYNCHER_SITE_BASE_URL || env.SITE_BASE_URL || 'https://www.timesyncher.com').replace(/\/+$/, '');
  return `${base}/api/mcp`;
}

function buildAiImportHandoffText({
  vacationName = 'this vacation',
  vacationId = '',
  destination = '',
  startDate = '',
  endDate = '',
  mcpEndpoint = 'https://www.timesyncher.com/api/mcp',
  token = '',
} = {}) {
  const name = cleanText(vacationName, 180) || 'this vacation';
  const dest = cleanText(destination, 180);
  const dates = [cleanText(startDate, 20), cleanText(endDate, 20)].filter(Boolean).join(' to ');
  const lines = [
    'Vacay Keepsake AI Import Handoff',
    '',
    `Please help me import or update my vacation "${name}" in Vacay Keepsake.`,
    `Vacation name: ${name}`,
    ...(dest ? [`Destination: ${dest}`] : []),
    ...(dates ? [`Dates: ${dates}`] : []),
    ...(vacationId ? [`Vacation ID: ${cleanText(vacationId, 80)}`] : []),
    `MCP endpoint: ${cleanText(mcpEndpoint, 400)}`,
    `Authorization header: Authorization: Bearer ${cleanText(token, 300)}`,
    'Transport: MCP over Streamable HTTP (JSON-RPC 2.0 POST to the MCP endpoint with Content-Type: application/json and the Authorization header above).',
    '',
    'How to discover the tools and import format:',
    '1. Call JSON-RPC method "tools/list" (or GET the MCP endpoint) to inspect all available tools and input schemas.',
    '2. Call tool "describe_import_format" (arguments: {}) to read the exact Vacay Keepsake JSON schema and a complete valid example.',
    `3. Optionally call tool "read_vacation" (arguments: {}) to see what is already saved in "${name}" (including item IDs for targeted edits).`,
    '',
    `Steps to build and submit a preview for "${name}":`,
    `1. Read the schema from "describe_import_format" and format the details for "${name}" into that JSON structure (vacation, days, flights, hotels, cars, restaurants, stores, things_to_do, unscheduled_things, notes).`,
    `2. Call tool "start_import" with that vacation JSON and apply_mode: "populate_scoped" so your draft targets "${name}". This returns a draft_id.`,
    '3. If there are photos or videos, call tool "upload_media" with action "request_upload", PUT the raw media bytes to each returned upload_url, then call "upload_media" with action "finalize".',
    `4. Call tool "preview_import" with { "draft_id": "<draft_id>" } to build the exact landing preview of "${name}" and get its preview_hash.`,
    '5. Call tool "commit_import" with { "draft_id": "<draft_id>", "preview_hash": "<preview_hash>" } to submit the staged preview for approval.',
    '(For targeted edits to existing items instead of a full import, call "update_vacation" with dry_run: true to preview, then call "update_vacation" with the returned preview_hash.)',
    '',
    'Important: Nothing goes live in Vacay Keepsake until I review and approve it in the app.',
  ];
  return lines.join('\n');
}

function buildPreviewSummaryBullets(kind, preview = {}) {
  const out = [];
  if (kind === 'draft_import') {
    const vac = asObject(preview.vacation || preview.will_create?.vacation);
    if (vac.title) out.push(`Vacation: ${vac.title}${vac.destination ? ` (${vac.destination})` : ''}`);
    const c = asObject(preview.counts);
    const counts = [
      c.days && `${c.days} day${c.days === 1 ? '' : 's'}`,
      c.flights && `${c.flights} flight${c.flights === 1 ? '' : 's'}`,
      c.hotels && `${c.hotels} hotel${c.hotels === 1 ? '' : 's'}`,
      c.cars && `${c.cars} car${c.cars === 1 ? '' : 's'}`,
      c.restaurants && `${c.restaurants} restaurant${c.restaurants === 1 ? '' : 's'}`,
      c.stores && `${c.stores} store${c.stores === 1 ? '' : 's'}`,
      c.things_to_do && `${c.things_to_do} activity item${c.things_to_do === 1 ? '' : 's'}`,
      c.unscheduled_things && `${c.unscheduled_things} saved unscheduled item${c.unscheduled_things === 1 ? '' : 's'}`,
      c.media && `${c.media} media file${c.media === 1 ? '' : 's'}`,
    ].filter(Boolean);
    if (counts.length) out.push(`Will stage: ${counts.join(', ')}`);
    return out;
  }
  const add = asArray(preview.will_add);
  const upd = asArray(preview.will_update);
  const rem = asArray(preview.will_remove);
  const dayUpd = asArray(preview.day_updates);
  const media = asArray(preview.will_attach_media);
  if (add.length) out.push(`Add ${add.length}: ${add.map((i) => i.title).filter(Boolean).join(', ')}`);
  if (upd.length) out.push(`Update ${upd.length}: ${upd.map((i) => i.current_title).filter(Boolean).join(', ')}`);
  if (rem.length) out.push(`Remove ${rem.length}: ${rem.map((i) => i.title).filter(Boolean).join(', ')}`);
  if (dayUpd.length) out.push(`Update ${dayUpd.length} day(s): ${dayUpd.map((d) => d.day_date).filter(Boolean).join(', ')}`);
  if (media.length) out.push(`Attach ${media.length} media file(s)`);
  return out;
}

async function resolvePersonEmail(db, { session, seat, tripId }) {
  const direct = cleanText(session?.email, 180).toLowerCase();
  if (direct && direct.includes('@')) return direct;
  if (!seat) return null;
  try {
    if (seat.inviteId) {
      const rows = await db`
        select metadata from vacation_collaborators
        where invite_id = ${seat.inviteId} and status = 'active'
        limit 1
      `;
      const email = cleanText(rows[0]?.metadata?.email, 180).toLowerCase();
      if (email && email.includes('@')) return email;
      const inv = await db`
        select metadata from vacation_collaborator_invites
        where id = ${seat.inviteId}
        limit 1
      `;
      const invEmail = cleanText(inv[0]?.metadata?.email, 180).toLowerCase();
      if (invEmail && invEmail.includes('@')) return invEmail;
    }
    if (tripId && session?.token) {
      const rows = await db`
        select metadata from vacation_collaborators
        where owner_customer_id = ${seat.ownerCustomerId}
          and status = 'active'
          and metadata->>'onboardingToken' = ${session.token}
        limit 1
      `;
      const email = cleanText(rows[0]?.metadata?.email, 180).toLowerCase();
      if (email && email.includes('@')) return email;
    }
  } catch (error) {
    void error;
  }
  return null;
}

export async function handleAiImportChatTurn(db, { session, trip, requestText, httpReq = null, env = process.env, now = () => new Date() }) {
  const started = Date.now();
  const seat = seatFromSession(session);
  const transcriptOwnerId = transcriptCustomerId(session);
  const personCustomerId = cleanText(session?.customer_id, 80) || null;
  const personName = cleanText(
    seat?.displayName || [session?.first_name, session?.last_name].filter(Boolean).join(' ') || session?.display_name,
    120,
  ) || (seat ? 'Collaborator' : 'Owner');
  const tripId = trip?.id ? String(trip.id) : null;
  const receivedAt = now().toISOString();

  await db`
    insert into transcript_turns (
      customer_id, trip_id, speaker, channel, body, payload, direction, received_at
    )
    values (
      ${transcriptOwnerId}, ${tripId}, 'customer', 'vacation-app', ${requestText},
      ${{
        source: 'vacation_app',
        surface: 'vacation-app',
        selectedTripId: tripId,
        authorName: personName,
        authorId: personCustomerId,
        forCustomerId: personCustomerId,
        liveTranscript: { role: 'customer', text: requestText, speakerName: personName, at: receivedAt },
      }},
      'inbound', now()
    )
  `;

  if (!tripId) {
    const reply = 'Tell me the name or destination of your vacation first, and I will create a private AI import card right here in chat.';
    await db`
      insert into transcript_turns (
        customer_id, trip_id, speaker, channel, body, payload, direction, sent_at, response_latency_ms
      )
      values (
        ${transcriptOwnerId}, ${null}, 'app', 'vacation-app', ${reply},
        ${{
          source: 'vacation_app',
          surface: 'vacation-app',
          selectedTripId: null,
          forCustomerId: personCustomerId,
          liveTranscript: { role: 'app', text: reply, at: now().toISOString() },
        }},
        'outbound', now(), ${Math.max(1, Date.now() - started)}
      )
    `;
    return {
      ok: true,
      status: 'replied',
      reply,
      aiImportCard: null,
      latencyMs: Math.max(1, Date.now() - started),
      error: null,
    };
  }

  const personEmail = await resolvePersonEmail(db, { session, seat, tripId });
  const role = seat ? 'collaborator' : 'owner';
  const ownerCustomerId = seat ? seat.ownerCustomerId : personCustomerId;
  const created = await createMcpToken(db, {
    tripId,
    ownerCustomerId,
    createdByEmail: personEmail,
    label: `${personName} AI`,
    role,
    expiresInDays: 30,
    metadata: {
      source: 'chat_ai_import',
      personCustomerId,
      personName,
      personEmail,
      role,
    },
    now,
    env,
  });

  const vacationName = cleanText(trip?.title || trip?.destination, 180) || 'this vacation';
  const mcpEndpoint = resolveMcpEndpointUrl(httpReq, env);
  const maskedToken = maskMcpToken(created.token);
  const copyText = buildAiImportHandoffText({
    vacationName,
    vacationId: tripId,
    destination: trip?.destination || '',
    startDate: trip?.startDate || trip?.start_date || '',
    endDate: trip?.endDate || trip?.end_date || '',
    mcpEndpoint,
    token: created.token,
  });

  const storedCard = {
    kind: 'ai_import_handoff',
    vacationId: tripId,
    vacationName,
    tokenId: created.record.id,
    tokenPrefix: created.record.tokenPrefix,
    maskedToken,
    expiresAt: created.record.expiresAt,
    mcpEndpoint,
    role,
    forCustomerId: personCustomerId,
  };
  const reply = `Ready to import into "${vacationName}" from your AI.`;
  const latencyMs = Math.max(1, Date.now() - started);

  await db`
    insert into transcript_turns (
      customer_id, trip_id, speaker, channel, body, payload, direction, sent_at, response_latency_ms
    )
    values (
      ${transcriptOwnerId}, ${tripId}, 'app', 'vacation-app', ${reply},
      ${{
        source: 'vacation_app',
        surface: 'vacation-app',
        selectedTripId: tripId,
        forCustomerId: personCustomerId,
        forEmail: personEmail,
        aiImportCard: storedCard,
        liveTranscript: { role: 'app', text: reply, at: now().toISOString() },
      }},
      'outbound', now(), ${latencyMs}
    )
  `;

  return {
    ok: true,
    status: 'replied',
    reply,
    aiImportCard: { ...storedCard, copyText },
    latencyMs,
    error: null,
  };
}

export async function postStagedPreviewToChat(db, {
  tokenRecord,
  changeSetId,
  kind = 'draft_import',
  preview = {},
  summary = '',
}) {
  const tripId = cleanText(tokenRecord?.tripId, 80);
  if (!tripId || !changeSetId) return null;
  let ownerCustomerId = cleanText(tokenRecord?.ownerCustomerId, 80) || null;
  let shareSlug = '';
  try {
    const tripRows = await db`
      select id, customer_id, title, metadata
      from trips
      where id = ${tripId}
      limit 1
    `;
    const tripRow = tripRows[0];
    if (tripRow) {
      if (!ownerCustomerId && tripRow.customer_id) ownerCustomerId = String(tripRow.customer_id);
      shareSlug = vacationShareSlugForRow(tripRow);
    }
  } catch (error) {
    void error;
  }
  if (!ownerCustomerId) return null;

  const meta = asObject(tokenRecord?.metadata);
  const forCustomerId = cleanText(meta.personCustomerId, 80) || (tokenRecord?.role === 'owner' ? ownerCustomerId : null);
  const forEmail = cleanText(meta.personEmail || tokenRecord?.createdByEmail, 180).toLowerCase() || null;
  const summaryText = cleanText(preview?.summary_text || summary, 500) || 'Your AI staged vacation updates for your review.';
  const bullets = buildPreviewSummaryBullets(kind, preview);
  const card = {
    kind: 'ai_staged_approval',
    changeSetId: String(changeSetId),
    changeKind: kind === 'targeted_edit' ? 'targeted_edit' : 'draft_import',
    status: 'pending_approval',
    previewHash: cleanText(preview?.preview_hash, 128),
    summary: summaryText,
    bullets,
    vacationId: tripId,
    vacationTitle: cleanText(preview?.vacation?.title || preview?.will_create?.vacation?.title, 180),
    counts: asObject(preview?.counts),
    mediaCount: Number(preview?.media_count ?? asArray(preview?.media).length ?? 0),
    missing: asArray(preview?.missing).slice(0, 6),
    conflicts: asArray(preview?.conflicts).slice(0, 6),
    shareSlug,
  };
  const body = 'Your AI staged a preview for your review.';
  try {
    await db`
      insert into transcript_turns (
        customer_id, trip_id, speaker, channel, body, payload, direction, sent_at, response_latency_ms
      )
      values (
        ${ownerCustomerId}, ${tripId}, 'app', 'vacation-app', ${body},
        ${{
          source: 'vacation_app',
          surface: 'vacation-app',
          selectedTripId: tripId,
          forCustomerId,
          forEmail,
          aiApprovalCard: card,
          liveTranscript: { role: 'app', text: body, at: new Date().toISOString() },
        }},
        'outbound', now(), 0
      )
    `;
    return card;
  } catch (error) {
    void error;
    return null;
  }
}

export async function syncApprovalCardStatusInChat(db, { tripId, changeSetId, status }) {
  const normalizedTripId = cleanText(tripId, 80);
  const normalizedId = cleanText(changeSetId, 80);
  const normalizedStatus = status === 'approved' || status === 'declined' ? status : '';
  if (!normalizedTripId || !normalizedId || !normalizedStatus) return;
  try {
    await db`
      update transcript_turns
      set payload = jsonb_set(payload, '{aiApprovalCard,status}', ${JSON.stringify(normalizedStatus)}::jsonb, true)
      where trip_id = ${normalizedTripId}
        and payload->'aiApprovalCard'->>'changeSetId' = ${normalizedId}
    `;
  } catch (error) {
    void error;
  }
}

export function isTurnVisibleToViewer(row, session, seat) {
  const payload = row?.payload && typeof row.payload === 'object' ? row.payload : {};
  const isPersonalAi = Boolean(payload.aiImportCard || payload.aiApprovalCard || payload.forCustomerId);
  if (!isPersonalAi) return true;
  const viewerId = cleanText(session?.customer_id || session?.viewerId, 80);
  const targetId = cleanText(payload.forCustomerId, 80);
  if (targetId && viewerId) return targetId === viewerId;
  const viewerEmail = cleanText(session?.email, 180).toLowerCase();
  const targetEmail = cleanText(payload.forEmail, 180).toLowerCase();
  if (targetEmail && viewerEmail) return targetEmail === viewerEmail;
  if (payload.aiApprovalCard && !targetId && !targetEmail) return !seat;
  return false;
}
