import { callTieredModel, loadVacationAppReplyRules } from '../../scripts/vacation-app-reply-rules.mjs';

function clean(value, max = 500) {
  return String(value ?? '').trim().slice(0, max);
}

function normalizeName(value) {
  return clean(value, 240).toLowerCase().replace(/[^a-z0-9]+/g, ' ');
}

export function normalizeItineraryPlaceQuery(placeQuery) {
  let query = normalizeName(placeQuery);
  if (!query) return '';
  query = query.replace(/^(move|reschedule|change|shift)\s+/, '');
  query = query.replace(/^(dinner|lunch|breakfast)\s+(at\s+)?/, '');
  query = query.replace(/\s+(on\s+)?day\s+\d+\s*$/, '').trim();
  return query;
}

function parseIntentJson(text) {
  const raw = clean(text, 4000);
  let slice = raw;
  const fence = raw.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/i);
  if (fence?.[1]) slice = fence[1];
  else {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start >= 0 && end > start) slice = raw.slice(start, end + 1);
  }
  try {
    const parsed = JSON.parse(slice);
    const op = clean(parsed.op, 40).toLowerCase();
    if (!['set_time', 'add_bar_before', 'undo', 'none'].includes(op)) return { op: 'none' };
    return {
      op,
      placeQuery: clean(parsed.placeQuery || parsed.place || parsed.title, 240),
      dayNumber: Number(parsed.dayNumber ?? parsed.day ?? 0) || null,
      time: clean(parsed.time, 40),
    };
  } catch {
    return { op: 'none' };
  }
}

export function coalesceChatItineraryEditIntent(modelIntent, offlineIntent) {
  const model = modelIntent && typeof modelIntent === 'object' ? modelIntent : { op: 'none' };
  const offline = offlineIntent && typeof offlineIntent === 'object' ? offlineIntent : { op: 'none' };
  const modelOp = clean(model.op, 40).toLowerCase();
  if (!modelOp || modelOp === 'none') return offline;
  return {
    op: modelOp,
    placeQuery: clean(model.placeQuery || model.place || model.title, 240) || clean(offline.placeQuery, 240),
    dayNumber: Number(model.dayNumber ?? model.day ?? 0) || Number(offline.dayNumber ?? 0) || null,
    time: clean(model.time, 40) || clean(offline.time, 40),
  };
}

export function offlineParseItineraryEditIntent(customerTurn) {
  const turn = typeof customerTurn === 'object' && customerTurn !== null
    ? (customerTurn.customerTurn ?? customerTurn.text ?? customerTurn.message ?? '')
    : customerTurn;
  const text = clean(turn, 8000);
  if (/\bundo\b/i.test(text)) return { op: 'undo', placeQuery: '', dayNumber: null, time: '' };
  const addBar = /\badd\b[^.\n]{0,80}\bbar\b/i.test(text) && /\bbefore\b/i.test(text);
  if (addBar) {
    const anchor = (text.match(/\bbefore\s+([^,.\n]+)/i) || [])[1] || '';
    const place = anchor || (text.match(/\b(?:at|dinner at|lunch at)\s+([^,.\n]+)/i) || [])[1] || '';
    const day = Number((text.match(/\bday\s*(\d{1,2})\b/i) || [])[1] || 0) || null;
    return { op: 'add_bar_before', placeQuery: clean(place, 240), dayNumber: day, time: '' };
  }
  const moveBare = text.match(/\bmove\s+([^,.\n]+?)\s+to\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i);
  if (moveBare) {
    const day = Number((text.match(/\bday\s*(\d{1,2})\b/i) || [])[1] || 0) || null;
    return {
      op: 'set_time',
      placeQuery: clean(moveBare[1], 240),
      dayNumber: day,
      time: clean(moveBare[2], 40),
    };
  }
  const possessiveChange = text.match(
    /\b(?:please\s+)?change\s+([^'’\s][^,.\n']{0,80}?)['’]s\b[^.\n]{0,100}?\b(?:to|at)\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i,
  );
  if (possessiveChange) {
    const day = Number((text.match(/\bday\s*(\d{1,2})\b/i) || [])[1] || 0) || null;
    return {
      op: 'set_time',
      placeQuery: clean(possessiveChange[1], 240),
      dayNumber: day,
      time: clean(possessiveChange[2], 40),
    };
  }
  const timeMove = text.match(/\b(?:move|reschedule|change)\b[\s\S]{0,120}?\b(?:to|at)\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i);
  if (timeMove) {
    const possessive = (text.match(/\bchange\s+([^'’\s][^'’\n,]+?)['’]s\b/i) || [])[1] || '';
    const placeAt = (text.match(/\b(?:at)\s+([^,.\n]+?)(?:\s+to\b|\s+on\b|$)/i) || [])[1] || '';
    const placeLoose = (text.match(/\b([^,.\n]+?)['’]s\b/i) || text.match(/\b(?:dinner|lunch)\s+(?:at|for)\s+([^,.\n]+)/i) || [])[1] || '';
    const place = possessive || placeAt || placeLoose;
    const day = Number((text.match(/\bday\s*(\d{1,2})\b/i) || [])[1] || 0) || null;
    return {
      op: 'set_time',
      placeQuery: clean(place.replace(/\b(dinner|lunch|breakfast)\b/gi, '').trim(), 240),
      dayNumber: day,
      time: clean(timeMove[1], 40),
    };
  }
  return { op: 'none', placeQuery: '', dayNumber: null, time: '' };
}

export async function extractItineraryEditIntent({ customerTurn, env = process.env }) {
  const offline = offlineParseItineraryEditIntent(customerTurn);
  if (String(env.CHAT_ITINERARY_EDIT_OFFLINE_PARSE || '') === '1') return offline;
  if (offline.op !== 'none') return offline;
  try {
    const rules = await loadVacationAppReplyRules(env);
    if (!rules?.ok) return offline.op !== 'none' ? offline : { op: 'none' };
    const model = await callTieredModel({
      rules, jev: { jevRan: true, modelTier: 1 }, customerTurn, stage: 'vacation_conversation', screen: 'vacation-app',
      destination: '', memory: [], upsell: 'forbidden', postIntake: false, env, timeoutMs: 20000,
      systemExtra: 'JSON only {op,placeQuery,dayNumber,time} with op set_time|add_bar_before|undo|none. placeQuery must be an exact saved place name from the trip.',
    });
    return coalesceChatItineraryEditIntent(parseIntentJson(model?.text || ''), offline);
  } catch {
    return offline.op !== 'none' ? offline : { op: 'none' };
  }
}
