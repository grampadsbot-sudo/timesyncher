import { cleanText } from './http.mjs';
import { seatFromSession, transcriptCustomerId } from './collaborator-app-seat.mjs';
import { loadTripContext } from './mcp-media-service.mjs';
import { asArray, asObject } from './mcp-read.mjs';
import { postStagedPreviewToChat } from './mcp-chat-import.mjs';
import {
  extractPreviewVersion,
  markPriorApprovalCardsReplaced,
  revisePendingChangeSet,
} from './mcp-preview-revision.mjs';
import {
  collectDraftEntries,
  findReferencedLiveOnlyThing,
  formatClock12,
  formatDayFriendly,
  matchDraftEntry,
  matchPreviewMedia,
  parseClockTime,
  parseDayTarget,
  sectionForCategory,
  updateIsoTimestamp,
  vacationDateSummary,
} from './mcp-chat-preview-parse.mjs';

const EDIT_VERB_RE = /\b(move|put|place|attach|assign|schedule|reschedule|shift|change|set|make|update|drop|remove|delete|skip|omit|rescue|keep|fix|edit|adjust|tweak)\b/i;
const MEDIA_WORD_RE = /\b(photo|photos|picture|pic|image|video|videos|clip|footage|media|file)\b|\.(?:jpe?g|png|webp|heic|mp4|mov|webm|m4v)\b/i;
const RESCUE_WAS_RE = /\b(?:photo|picture|pic|image|video|clip|file|media|\.(?:jpe?g|png|webp|mp4|mov))\b[\s\S]{0,60}\b(?:was|is|belonged|belongs|from)\b/i;
const PREVIEW_WORD_RE = /\b(preview|pending|import|won'?t\s+be\s+imported|saved\s+for\s+later|before\s+approv)/i;
const REMOVE_VERB_RE = /\b(drop|remove|delete|exclude|omit|skip)\b/i;
const NO_DATE_TARGET_RE = /\b(no\s+date|unplaced|not\s+placed|unassigned|without\s+a\s+date|remove\s+(?:its|the)\s+date)\b/i;
const FILE_EXT_RE = /\.(?:jpe?g|png|webp|heic|mov|mp4|webm|m4v)\b/i;

function isVideoMedia(media) {
  return String(media?.media_kind || media?.kind || '').toLowerCase() === 'video'
    || String(media?.mime_type || '').toLowerCase().startsWith('video/');
}

function mediaArticleNoun(media) {
  return isVideoMedia(media) ? 'a video' : 'a photo';
}

function safeMediaHint(media) {
  const caption = cleanText(media?.caption, 120);
  if (caption && !FILE_EXT_RE.test(caption)) return caption;
  return mediaArticleNoun(media);
}

function compactChangeMedia(media) {
  const mediaId = cleanText(media?.media_id || media?.id, 80);
  if (!mediaId) return null;
  const kind = isVideoMedia(media) ? 'video' : 'photo';
  const url = cleanText(media?.url || media?.preview_url || media?.public_url, 600)
    || `/api/mcp/media/${encodeURIComponent(mediaId)}`;
  const posterUrl = cleanText(media?.poster_url || media?.thumbnail_url, 600) || null;
  const caption = cleanText(media?.caption, 300);
  return {
    media_id: mediaId,
    media_kind: kind,
    mime_type: cleanText(media?.mime_type, 120) || (kind === 'video' ? 'video/mp4' : 'image/jpeg'),
    url,
    ...(posterUrl && posterUrl !== url ? { poster_url: posterUrl } : {}),
    ...(caption && !FILE_EXT_RE.test(caption) ? { caption } : {}),
  };
}

function upsertDraftMediaLink(draft, mediaId, patch) {
  const links = asArray(draft.media).filter((l) => String(l?.media_id || '') !== String(mediaId));
  links.push({ media_id: String(mediaId), ...patch });
  draft.media = links;
}

function applyClauseToDraft({ clause, draft, preview, days, liveThings, selectedMediaId }) {
  const lower = clause.toLowerCase();
  const entries = collectDraftEntries(draft);
  const liveOnly = findReferencedLiveOnlyThing(clause, liveThings, entries);
  if (liveOnly) {
    return {
      ok: false,
      limitBlocked: true,
      reply: `"${liveOnly.title}" is already live on this vacation. Changes here only update your pending preview — you can edit live items normally after approving or declining.`,
    };
  }

  const mentionsMedia = MEDIA_WORD_RE.test(clause) || Boolean(selectedMediaId);
  const isRemove = REMOVE_VERB_RE.test(clause);

  if (mentionsMedia && isRemove && !/\b(?:move|put|place|attach|assign|to\s+day|on\s+day)\b/i.test(clause)) {
    const matched = matchPreviewMedia(clause, preview, { selectedMediaId });
    if (!matched.media) {
      const hints = [...new Set(matched.candidates.map(safeMediaHint).filter(Boolean))];
      const list = hints.length > 1 ? hints.join(', ') : '';
      return {
        ok: false,
        clarified: true,
        reply: list
          ? `Which photo or video should I drop from this preview: ${list}?`
          : 'Which photo or video would you like to drop from this pending preview?',
      };
    }
    const removed = new Set(asArray(draft.removed_media_ids).map(String));
    removed.add(String(matched.media.media_id));
    draft.removed_media_ids = [...removed];
    draft.media = asArray(draft.media).filter((l) => String(l?.media_id || '') !== String(matched.media.media_id));
    return {
      ok: true,
      change: {
        text: `Removed ${mediaArticleNoun(matched.media)} from the preview`,
        media: compactChangeMedia(matched.media),
      },
    };
  }

  if (mentionsMedia && (RESCUE_WAS_RE.test(clause) || /\b(?:put|place|move|attach|assign|rescue|keep|add|tag|link)\b/i.test(clause))) {
    if (NO_DATE_TARGET_RE.test(clause)) {
      return {
        ok: false,
        limitBlocked: true,
        reply: 'Every photo or video needs a vacation day or stop to be imported. Tell me which vacation day or stop to attach it to, or ask me to drop it.',
      };
    }
    const dayTarget = parseDayTarget(clause, days);
    if (dayTarget.outOfRange) {
      return {
        ok: false,
        limitBlocked: true,
        reply: `${dayTarget.requested} is outside this vacation (${vacationDateSummary(days)}). Please pick one of this vacation's days or stops.`,
      };
    }
    if (dayTarget.unscheduled) {
      return {
        ok: false,
        limitBlocked: true,
        reply: 'Photos and videos must attach to a vacation day or a specific stop. Which day or stop should I attach it to?',
      };
    }
    const preferSkipped = RESCUE_WAS_RE.test(clause) || /\b(?:rescue|won'?t\s+be\s+imported|skipped|undated|out[- ]of[- ]range)\b/i.test(clause);
    const matchedMedia = matchPreviewMedia(clause, preview, { preferSkipped, selectedMediaId });
    if (!matchedMedia.media) {
      const hints = [...new Set(matchedMedia.candidates.map(safeMediaHint).filter(Boolean))];
      const list = hints.length > 1 ? hints.join(', ') : '';
      return {
        ok: false,
        clarified: true,
        reply: list
          ? `Which photo or video did you mean: ${list}?`
          : 'Which photo or video would you like to place on this preview?',
      };
    }
    const mealWord = /\bdinner\b/i.test(lower) ? 'dinner' : (/\blunch|brunch\b/i.test(lower) ? 'lunch' : (/\bbreakfast|coffee\b/i.test(lower) ? 'breakfast' : ''));
    const targetPhrase = clause.replace(new RegExp(String(matchedMedia.media.filename || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'ig'), '');
    const matchedEntry = dayTarget.day
      ? matchDraftEntry(targetPhrase, entries, { dayDate: dayTarget.day.date, mealWord })
      : matchDraftEntry(targetPhrase, entries, { mealWord });

    const thatMedia = isVideoMedia(matchedMedia.media) ? 'that video' : 'that photo';
    if (matchedEntry.ambiguous) {
      return {
        ok: false,
        clarified: true,
        reply: `Which stop should I attach ${thatMedia} to: ${matchedEntry.candidates.map((c) => c.title).join(', ')}?`,
      };
    }
    if (!matchedEntry.entry && !dayTarget.day) {
      return {
        ok: false,
        clarified: true,
        reply: `Which vacation day (${vacationDateSummary(days)}) or stop should I attach ${thatMedia} to?`,
      };
    }
    const mediaNoun = mediaArticleNoun(matchedMedia.media);
    const changeMedia = compactChangeMedia(matchedMedia.media);
    if (matchedEntry.entry) {
      const targetDayDate = matchedEntry.entry.day_date || dayTarget.day?.date || null;
      upsertDraftMediaLink(draft, matchedMedia.media.media_id, {
        thing_ref: matchedEntry.entry.ref,
        day_date: targetDayDate,
        clear_thing: false,
      });
      const entryDay = targetDayDate
        ? days.find((d) => String(d?.date || '').slice(0, 10) === String(targetDayDate).slice(0, 10))
        : null;
      const daySuffix = entryDay ? ` on ${formatDayFriendly(entryDay)}` : '';
      const text = matchedMedia.media.isSkipped
        ? `Moved ${mediaNoun} from Won't be imported to ${matchedEntry.entry.title}${daySuffix}`
        : `Moved ${mediaNoun} to ${matchedEntry.entry.title}${daySuffix}`;
      return { ok: true, change: { text, media: changeMedia } };
    }
    upsertDraftMediaLink(draft, matchedMedia.media.media_id, {
      thing_ref: '',
      clear_thing: true,
      day_date: dayTarget.day.date,
    });
    const text = matchedMedia.media.isSkipped
      ? `Moved ${mediaNoun} from Won't be imported to ${formatDayFriendly(dayTarget.day)}`
      : `Moved ${mediaNoun} to ${formatDayFriendly(dayTarget.day)}`;
    return { ok: true, change: { text, media: changeMedia } };
  }

  const dayTarget = parseDayTarget(clause, days);
  if (dayTarget.outOfRange) {
    return {
      ok: false,
      limitBlocked: true,
      reply: `${dayTarget.requested} is outside this vacation (${vacationDateSummary(days)}). Changes can only use this vacation's days.`,
    };
  }
  const timeTarget = parseClockTime(clause);
  const mealWord = /\bdinner\b/i.test(lower) ? 'dinner' : (/\blunch|brunch\b/i.test(lower) ? 'lunch' : (/\bbreakfast|coffee\b/i.test(lower) ? 'breakfast' : ''));
  const matchedEntry = matchDraftEntry(clause, entries, { mealWord });

  if (matchedEntry.ambiguous) {
    return {
      ok: false,
      clarified: true,
      reply: `Which stop did you mean: ${matchedEntry.candidates.map((c) => c.title).join(', ')}?`,
    };
  }

  if (isRemove && matchedEntry.entry && !dayTarget.found && !timeTarget) {
    const target = matchedEntry.entry;
    draft[target.section] = asArray(draft[target.section]).filter((_, idx) => idx !== target.index);
    return { ok: true, change: `Removed ${target.title} from the preview` };
  }

  if (matchedEntry.entry && (dayTarget.found || timeTarget)) {
    const target = matchedEntry.entry;
    const itemCopy = { ...target.item };
    const parts = [];
    if (dayTarget.found) {
      if (dayTarget.unscheduled) {
        draft[target.section] = asArray(draft[target.section]).filter((_, idx) => idx !== target.index);
        delete itemCopy.day_date;
        delete itemCopy.starts_at;
        delete itemCopy.start_time;
        itemCopy.unscheduled = true;
        draft.unscheduled_things = [...asArray(draft.unscheduled_things), itemCopy];
        parts.push(`Moved ${target.title} to Saved for later`);
      } else if (dayTarget.day) {
        const nextDate = dayTarget.day.date;
        itemCopy.day_date = nextDate;
        itemCopy.unscheduled = false;
        if (timeTarget) {
          itemCopy.start_time = timeTarget;
          itemCopy.starts_at = updateIsoTimestamp(itemCopy.starts_at, nextDate, timeTarget);
        } else if (itemCopy.starts_at) {
          itemCopy.starts_at = updateIsoTimestamp(itemCopy.starts_at, nextDate, null);
        }
        if (target.section === 'unscheduled_things') {
          draft.unscheduled_things = asArray(draft.unscheduled_things).filter((_, idx) => idx !== target.index);
          const nextSection = sectionForCategory(target.category);
          draft[nextSection] = [...asArray(draft[nextSection]), itemCopy];
        } else {
          draft[target.section][target.index] = itemCopy;
        }
        parts.push(
          timeTarget
            ? `Moved ${target.title} to ${formatDayFriendly(dayTarget.day)} at ${formatClock12(timeTarget)}`
            : `Moved ${target.title} to ${formatDayFriendly(dayTarget.day)}`,
        );
      }
    } else if (timeTarget) {
      itemCopy.start_time = timeTarget;
      itemCopy.starts_at = updateIsoTimestamp(itemCopy.starts_at, target.day_date || days[0]?.date, timeTarget);
      draft[target.section][target.index] = itemCopy;
      parts.push(`Updated ${target.title} to ${formatClock12(timeTarget)}`);
    }
    return { ok: true, change: parts.join('; ') };
  }

  return {
    ok: false,
    clarified: true,
    reply: `What would you like to change in this pending preview? Name a stop, photo, or video and tell me which day (${vacationDateSummary(days)}) or time to use.`,
  };
}

function splitClauses(requestText) {
  const cleaned = cleanText(requestText, 2000);
  if (!cleaned) return [];
  return cleaned
    .split(/\s*(?:;|\n|\band\s+(?=(?:move|put|place|attach|assign|drop|remove|delete|change|set|make|update|rescue|keep|the\s+)))/i)
    .map((part) => part.trim())
    .filter(Boolean);
}

async function findPendingPreviewForChat(db, { tripId, session, seat, changeSetId = '' }) {
  const normalizedTripId = cleanText(tripId, 80);
  if (!normalizedTripId) return null;
  let rows;
  try {
    rows = await db`
      select * from vacation_mcp_change_sets
      where scope_trip_id = ${normalizedTripId}
      order by created_at desc
    `;
  } catch (error) {
    const code = String(error?.code || '');
    const msg = String(error?.message || '');
    if (code === '42P01' || /relation\s+["']?vacation_mcp_change_sets["']?\s+does not exist/i.test(msg)) {
      return null;
    }
    throw error;
  }
  const pending = asArray(rows).filter((r) => r.status === 'pending_approval');
  if (!pending.length) return null;
  if (changeSetId) {
    const exact = pending.find((r) => String(r.id) === String(changeSetId));
    if (exact) return exact;
  }
  if (!seat) return pending[0];
  const viewerId = cleanText(session?.customer_id, 80);
  const viewerEmail = cleanText(session?.email, 180).toLowerCase();
  const tokens = await db`select * from vacation_mcp_tokens where trip_id = ${normalizedTripId}`;
  const tokenById = new Map(tokens.map((t) => [String(t.id), t]));
  const mine = pending.find((r) => {
    const tok = tokenById.get(String(r.token_id || ''));
    const meta = asObject(tok?.metadata);
    if (viewerId && cleanText(meta.personCustomerId, 80) === viewerId) return true;
    if (viewerEmail && cleanText(meta.personEmail || tok?.created_by_email, 180).toLowerCase() === viewerEmail) return true;
    return false;
  });
  return mine || pending[0];
}

function isPendingPreviewChangeRequest(requestText, { changeSet, liveThings = [] }) {
  const text = cleanText(requestText, 2000);
  if (!text || !changeSet) return false;
  if (PREVIEW_WORD_RE.test(text) || RESCUE_WAS_RE.test(text) || EDIT_VERB_RE.test(text)) return true;
  const preview = asObject(changeSet.preview);
  const entries = collectDraftEntries(asObject(changeSet.payload));
  const hasTime = Boolean(parseClockTime(text));
  const hasDay = parseDayTarget(text, asArray(preview.days)).found;
  const mealWord = /\blunch\b/i.test(text) ? 'lunch' : (/\bdinner\b/i.test(text) ? 'dinner' : '');
  if ((hasTime || hasDay) && (matchDraftEntry(text, entries, { mealWord }).entry || MEDIA_WORD_RE.test(text))) {
    return true;
  }
  if (findReferencedLiveOnlyThing(text, liveThings, entries) && (hasTime || hasDay)) return true;
  return false;
}

async function persistChatTurns(db, { transcriptOwnerId, tripId, personName, personCustomerId, requestText, reply, receivedAt, now, latencyMs }) {
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
  if (reply !== null) {
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
          liveTranscript: { role: 'app', text: reply, at: now().toISOString() },
        }},
        'outbound', now(), ${latencyMs}
      )
    `;
  }
}

export async function handlePendingPreviewChatTurn(db, {
  session, trip, requestText, changeSetId = '', selectedMediaId = '', now = () => new Date(),
}) {
  const started = Date.now();
  const tripId = trip?.id ? String(trip.id) : '';
  const seat = seatFromSession(session);
  const changeSet = await findPendingPreviewForChat(db, { tripId, session, seat, changeSetId });
  if (!changeSet) return null;
  const { trip: existingTrip, things: liveThings } = await loadTripContext(db, tripId);
  const transcriptOwnerId = transcriptCustomerId(session);
  const personCustomerId = cleanText(session?.customer_id, 80) || null;
  const personEmail = cleanText(session?.email, 180).toLowerCase() || null;
  const personName = cleanText(
    seat?.displayName || [session?.first_name, session?.last_name].filter(Boolean).join(' ') || session?.display_name,
    120,
  ) || (seat ? 'Collaborator' : 'Owner');
  const receivedAt = now().toISOString();

  const prevPreview = asObject(changeSet.preview);
  const days = asArray(prevPreview.days);
  const nextPayload = structuredClone(asObject(changeSet.payload));
  const clauses = splitClauses(requestText);
  const appliedChanges = [];

  for (const clause of clauses) {
    const result = applyClauseToDraft({
      clause, draft: nextPayload, preview: prevPreview, days, liveThings, selectedMediaId,
    });
    if (!result.ok) {
      const latencyMs = Math.max(1, Date.now() - started);
      await persistChatTurns(db, {
        transcriptOwnerId, tripId, personName, personCustomerId, requestText,
        reply: result.reply, receivedAt, now, latencyMs,
      });
      return {
        ok: true,
        status: 'replied',
        reply: result.reply,
        aiApprovalCard: null,
        changeSetId: String(changeSet.id),
        previewVersion: extractPreviewVersion(prevPreview),
        previewHash: cleanText(prevPreview.preview_hash, 128),
        clarified: Boolean(result.clarified),
        limitBlocked: Boolean(result.limitBlocked),
        latencyMs,
      };
    }
    appliedChanges.push(result.change);
  }

  const mediaRows = await db`
    select * from vacation_mcp_draft_media
    where scope_trip_id = ${tripId}
    order by created_at asc
  `;
  const revised = await revisePendingChangeSet(db, {
    changeSet, nextPayload, mediaRows, existingTrip, existingThings: liveThings, appliedChanges,
  });

  await persistChatTurns(db, {
    transcriptOwnerId, tripId, personName, personCustomerId, requestText, reply: null, receivedAt, now, latencyMs: 0,
  });
  await markPriorApprovalCardsReplaced(db, {
    tripId,
    changeSetId: changeSet.id,
    exceptHash: revised.preview.preview_hash,
    replacedByHash: revised.preview.preview_hash,
    replacedByVersion: revised.previewVersion,
  });

  const appliedChangeTexts = appliedChanges.map((item) => (typeof item === 'string' ? item : item.text));
  const reply = `Updated your pending preview: ${appliedChangeTexts.join('; ')}. Review the updated preview below before approving.`;
  const tokenRecord = {
    tripId,
    ownerCustomerId: transcriptOwnerId,
    role: seat ? 'collaborator' : 'owner',
    createdByEmail: personEmail,
    metadata: { personCustomerId, personEmail },
  };
  const card = await postStagedPreviewToChat(db, {
    tokenRecord,
    changeSetId: changeSet.id,
    kind: changeSet.kind,
    preview: revised.preview,
    summary: revised.preview.summary_text,
    replyBody: reply,
  });
  return {
    ok: true,
    status: 'replied',
    reply,
    aiApprovalCard: card,
    changeSetId: String(changeSet.id),
    previewVersion: revised.previewVersion,
    previewHash: revised.preview.preview_hash,
    previousPreviewHash: revised.previousPreviewHash,
    appliedChanges: appliedChangeTexts,
    clarified: false,
    limitBlocked: false,
    latencyMs: Math.max(1, Date.now() - started),
  };
}

export async function tryHandlePendingPreviewChatTurn(db, { session, trip, requestText, now = () => new Date() }) {
  const tripId = trip?.id ? String(trip.id) : '';
  if (!tripId || !cleanText(requestText, 2000)) return null;
  const seat = seatFromSession(session);
  const changeSet = await findPendingPreviewForChat(db, { tripId, session, seat });
  if (!changeSet) return null;
  const { things: liveThings } = await loadTripContext(db, tripId);
  if (!isPendingPreviewChangeRequest(requestText, { changeSet, liveThings })) return null;
  return handlePendingPreviewChatTurn(db, { session, trip, requestText, changeSetId: changeSet.id, now });
}
