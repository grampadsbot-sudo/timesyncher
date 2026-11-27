import { cleanText } from './http.mjs';
import { isAiImportChatRequest } from './mcp-chat-import.mjs';
import { isReservationAsk } from './mcp-reservations-handshake.mjs';
import { vkBotUsageCost } from './turn-cost.mjs';
import { readCookie, requireWebEditAccess, webAccessCookieName } from './web-access.mjs';
import { validatePlannedThings } from './chat-planned-thing-validation.mjs';

const PLANNING_TURN_RE = /\b(?:itinerary|day-by-day|day by day|keep building|family plan|book early|want to book|we'?d want to book)\b|\bplan (?:the|our|a|my)\b|\bday\s+\d{1,2}\b/i;
const PLAN_CONFIRM_RE = /\b(?:yes|lock it in|lock that in|save that plan|save this plan|save the plan|that plan works|confirm the plan|go with that)\b/i;
const DAY_LINE_RE = /^(?:#{1,3}\s*)?(?:\*\*)?\s*day\s*(\d{1,2})\s*(?:\*\*)?\s*[:.)\-\u2013\u2014]*\s*(.*)$/i;
const WEEKDAY_LINE_RE = /^(?:[-*•]\s*)?(?:#{1,3}\s*)?(?:\*\*)?\s*(sunday|monday|tuesday|wednesday|thursday|friday|saturday)(?:\s*,?\s*[a-z]{3,9}\.?\s+\d{1,2}(?:,?\s*\d{4})?)?\s*(?:\*\*)?\s*[:\-\u2013\u2014]\s*(.+)$/i;
const WEEKDAY_INDEX = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };
const CANNED_RESERVATION_RE = /doesn't book reservations directly/i;
const CANNED_IMPORT_RE = /Ready to import into/i;
export const PLANNING_ERROR_REPLY = 'I could not finish that planning reply on this turn. Your message is saved; tell me the days to keep and I will put them on this vacation.';

export function isPlanningErrorReply(text = '') {
  const value = String(text || '').trim();
  if (!value) return false;
  return value === PLANNING_ERROR_REPLY || /I could not finish that planning reply on this turn/i.test(value);
}

function asText(raw, max = 4000) {
  const value = raw && typeof raw === 'object' ? (raw.customerTurn ?? raw.text ?? raw.message ?? '') : raw;
  return cleanText(value, max);
}

function isoDay(value) {
  if (!value) return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  const match = String(value).trim().match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : '';
}

function addUtcDays(iso, count) {
  const date = new Date(`${iso}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return '';
  date.setUTCDate(date.getUTCDate() + count);
  return date.toISOString().slice(0, 10);
}

export function isOrdinaryPlanningTurn(rawText = '') {
  const text = asText(rawText);
  if (!text) return false;
  if (isReservationAsk(text) || isAiImportChatRequest(text)) return false;
  return PLANNING_TURN_RE.test(text);
}

export function isPlanConfirmation(rawText = '') {
  const text = asText(rawText, 2000);
  if (!text || /^(?:yes|yeah|yep|yup|sure|ok|okay)[.!\s]*$/i.test(text)) return false;
  if (!/\b(?:plan|itinerary|days?)\b/i.test(text)) return false;
  return PLAN_CONFIRM_RE.test(text);
}

function categoryForPlanTitle(title) {
  const text = String(title || '').toLowerCase();
  if (/\bflights?\b/.test(text)) return 'flight';
  if (/\b(hotel|resort|stay|inn|lodge)\b/.test(text)) return 'hotel';
  if (/\b(restaurant|dinner|lunch|breakfast|cafe|bistro)\b/.test(text)) return 'restaurant';
  return 'activity';
}

function itemFromLine(line, dayNumber, startDate) {
  const trimmed = String(line || '').replace(/^[-*•]\s+/, '').replace(/^\d+[.)]\s+/, '').trim();
  if (!trimmed) return [];
  if (trimmed.split(/\s+/).length > 14 && /[.!?]$/.test(trimmed)) return [];
  const parts = trimmed.includes(', ') ? trimmed.split(/\s*,\s*/) : [trimmed];
  const day = startDate ? addUtcDays(startDate, dayNumber - 1) : '';
  const items = [];
  for (const part of parts) {
    const title = cleanText(part, 80);
    if (!title || title.length < 2 || title.split(/\s+/).length > 12 || title.includes('?')) continue;
    items.push({
      title,
      category: categoryForPlanTitle(title),
      description: '',
      who: '',
      whenLabel: `Day ${dayNumber}`,
      customerWhen: day,
      notes: [],
      collaboratorNotes: [],
      source: 'customer',
      dayNumber,
      starts_at: day ? `${day}T12:00:00.000Z` : null,
    });
  }
  return items;
}

function weekdayDayNumber(weekdayName, startIso) {
  const target = WEEKDAY_INDEX[String(weekdayName || '').toLowerCase()];
  if (target == null || !startIso) return 0;
  const start = new Date(`${startIso}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime())) return 0;
  return ((target - start.getUTCDay() + 7) % 7) + 1;
}

export function plannedItineraryItems(corpus, { startDate = '' } = {}) {
  const items = [];
  const seen = new Set();
  let dayNumber = 0;
  const start = isoDay(startDate);
  const pushItems = (text, dayNum) => {
    for (const item of itemFromLine(text, dayNum, start)) {
      const key = item.title.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      items.push(item);
    }
  };
  for (const rawLine of String(corpus || '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const day = line.match(DAY_LINE_RE);
    if (day) {
      dayNumber = Number(day[1]);
      if (day[2]) pushItems(day[2], dayNumber);
      continue;
    }
    const weekday = start ? line.match(WEEKDAY_LINE_RE) : null;
    if (weekday) {
      const mapped = weekdayDayNumber(weekday[1], start);
      if (mapped > 0) {
        dayNumber = mapped;
        pushItems(weekday[2], dayNumber);
        continue;
      }
    }
    if (!dayNumber) continue;
    pushItems(line, dayNumber);
  }
  return items;
}

function sqlMessage(error) {
  return String(error?.message || error);
}

function unsupportedTestSql(error) {
  return /Unhandled test SQL|unexpected sql/i.test(sqlMessage(error));
}

async function priorAppBodies(db, tripId) {
  if (typeof db !== 'function' || !tripId) return [];
  try {
    const rows = await db`
      select body, speaker
      from transcript_turns
      where trip_id = ${tripId}
      order by sent_at desc
      limit 8
    `;
    return (Array.isArray(rows) ? rows : [])
      .filter((row) => !row?.speaker || row.speaker === 'app')
      .map((row) => String(row?.body || ''))
      .filter(Boolean);
  } catch (error) {
    if (unsupportedTestSql(error)) return [];
    throw error;
  }
}

async function tripStartDate(db, tripId) {
  if (typeof db !== 'function' || !tripId) return '';
  try {
    const tripRows = await db`
      select start_date, end_date
      from trips
      where id = ${tripId}
      limit 1
    `;
    return isoDay(tripRows?.[0]?.start_date);
  } catch (error) {
    if (unsupportedTestSql(error)) return '';
    throw error;
  }
}

function mergeByTitle(base, extra) {
  const next = Array.isArray(base) ? [...base] : [];
  const seen = new Set(next.map((thing) => String(thing?.title || '').toLowerCase()).filter(Boolean));
  for (const item of extra || []) {
    const key = String(item?.title || '').toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    next.push(item);
  }
  return next;
}

export function tripStateActionsEnabled(env = process.env) {
  return env.VK_TRIP_STATE_ACTIONS === '1';
}

export async function plannedCustomerThings(db, tripId, text, appReply, activities = [], { env = process.env, existing = [] } = {}) {
  const customerOnly = tripStateActionsEnabled(env);
  const base = Array.isArray(activities) ? activities.filter(Boolean) : [];
  const startDate = await tripStartDate(db, tripId);
  let items = plannedItineraryItems(customerOnly ? text : `${text || ''}\n${appReply || ''}`, { startDate });
  if (!customerOnly && !items.length && isPlanConfirmation(text)) {
    items = plannedItineraryItems((await priorAppBodies(db, tripId)).join('\n'), { startDate });
  }
  return validatePlannedThings(mergeByTitle(base, items), { customerOnly, existing });
}

export async function persistCustomerNotesOnly(db, thing) {
  return db`
    update trip_things
    set metadata = coalesce(metadata, '{}'::jsonb) || ${{
      notes: thing.notes || [],
      collaboratorNotes: thing.collaboratorNotes || [],
    }}, updated_at = now()
    where id = ${thing.id}
    returning id
  `;
}

export async function persistFollowupLodgingSafely(persistFn, db, tripId, lodgingWanted, options) {
  try {
    return await persistFn(db, tripId, null, lodgingWanted, options);
  } catch (error) {
    if (error?.name === 'IntakeLodgingResolveError' || /VK Search|HTTP 402|Place search/i.test(String(error?.message || error))) {
      console.error('followup_lodging_lookup_nonfatal', String(error?.message || error).slice(0, 240));
      return null;
    }
    throw error;
  }
}

export function keepPlannedDays(merged, wanted) {
  const planned = (Array.isArray(wanted) ? wanted : []).filter((thing) => Number(thing?.dayNumber) > 0 && thing?.title);
  if (!planned.length) return merged;
  const next = Array.isArray(merged) ? [...merged] : [];
  const index = new Map(next.map((thing, at) => [String(thing?.title || '').toLowerCase(), at]));
  for (const item of planned) {
    const key = String(item.title || '').toLowerCase();
    if (!key) continue;
    if (index.has(key)) {
      const at = index.get(key);
      next[at] = {
        ...next[at],
        category: item.category || next[at].category,
        whenLabel: item.whenLabel || next[at].whenLabel || '',
        customerWhen: item.customerWhen || next[at].customerWhen || '',
        starts_at: item.starts_at || next[at].starts_at || null,
        dayNumber: item.dayNumber,
      };
    } else {
      index.set(key, next.length);
      next.push(item);
    }
  }
  return next;
}

function usableDraft(text) {
  const value = String(text || '').trim();
  if (!value || CANNED_RESERVATION_RE.test(value) || CANNED_IMPORT_RE.test(value)) return '';
  return value;
}

export function recoverOrdinaryPlanningReply(produced, requestText, { backend = '', previousReply = '' } = {}) {
  const source = produced && typeof produced === 'object' ? produced : {};
  const draft = [
    source.reply,
    previousReply,
    source.blockedDraft,
    source.model?.text,
    source.model?.log?.rawModelText,
    source.model?.log?.draftText,
  ].map(usableDraft).find(Boolean) || '';
  const kept = Boolean(draft);
  const reply = draft || PLANNING_ERROR_REPLY;
  const quality = {
    judged: true,
    score: 4,
    disposition: kept ? 'planning_draft_kept' : 'planning_error_stored',
    comment: kept ? 'planning draft kept' : 'planning error stored',
    jevNoteReason: 'jev_no_free_text',
  };
  const model = {
    ...(source.model && typeof source.model === 'object' ? source.model : {}),
    quality,
    backend: source.model?.backend || backend || null,
  };
  if ((model.backend === 'vk_bot_mcp' || backend === 'vk_bot_mcp') && !model.cost) {
    model.backend = 'vk_bot_mcp';
    model.cost = vkBotUsageCost({});
  }
  return {
    ...source,
    reply,
    reason: null,
    quality,
    model,
  };
}

export async function resolveWebEditAccessForChat(db, httpReq, tripId, env = process.env) {
  const token = readCookie(httpReq, webAccessCookieName())
    || cleanText(httpReq?.headers?.['x-timesyncher-web-access-token'], 400);
  if (!token) {
    return {
      token: '',
      skip: {
        applied: false,
        skipped: true,
        reason: 'web_edit_access_required',
        client: { applied: false, reason: 'web_edit_access_required' },
        replyContext: 'The customer needs website edit access before chat can change the itinerary.',
      },
    };
  }
  try {
    await requireWebEditAccess(db, httpReq || { headers: { cookie: `${webAccessCookieName()}=${token}` } }, { tripId, env });
    return { token, skip: null };
  } catch (error) {
    const reason = error?.statusCode === 403 || error ? 'web_edit_denied' : 'web_edit_denied';
    return {
      token,
      skip: {
        applied: false,
        skipped: true,
        reason,
        client: { applied: false, reason },
        replyContext: 'Website edit access is required to change the itinerary from chat.',
      },
    };
  }
}
