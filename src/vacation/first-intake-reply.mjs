import { failReplyPlanEntitlement, loadTripOwnerReplyPlan } from './reply-plan-entitlement.mjs';
import { isCollaboratorAppSeat } from './collaborator-app-seat.mjs';
import { intakeReplyBlock, intakeReplyBlockReasons } from './first-intake-gate.mjs';

export { produceFirstIntakeReply } from './first-intake-reply-produce.mjs';
export { firstIntakeReplyLeak, intakeReplyBlock, intakeReplyBlockReasons } from './first-intake-gate.mjs';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function sessionFirstName(session) {
  const first = String(session?.first_name || session?.firstName || '').trim();
  if (first) return first;
  return String(session?.display_name || session?.displayName || session?.customerName || '').trim();
}

export function isoDay(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  const match = String(value ?? '').match(/\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : '';
}

function daysFromCivil(year, month, day) {
  const y = year - (month <= 2 ? 1 : 0);
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const mp = month + (month > 2 ? -3 : 9);
  const doy = Math.floor((153 * mp + 2) / 5) + day - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

function civilFromDays(z) {
  const days = z + 719468;
  const era = Math.floor(days / 146097);
  const doe = days - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const y = yoe + era * 400;
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const day = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const month = mp + (mp < 10 ? 3 : -9);
  return { year: y + (month <= 2 ? 1 : 0), month, day };
}

function daysInMonth(year, month) {
  if (month === 2) return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 29 : 28;
  return [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month] || 0;
}

export function weekdayForIso(value) {
  const iso = isoDay(value);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return '';
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return '';
  const days = daysFromCivil(year, month, day);
  return WEEKDAYS[((days + 4) % 7 + 7) % 7];
}

export function whenRelativeToToday(value, today = '') {
  const iso = isoDay(value);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return false;
  const todayIso = isoDay(today) || isoDay(civilToday());
  const now = /^(\d{4})-(\d{2})-(\d{2})$/.exec(todayIso);
  if (!now) return false;
  const month = Number(match[2]);
  const nowMonth = Number(now[2]);
  const nextYear = nowMonth < month ? Number(now[1]) : Number(now[1]) + 1;
  return Number(match[1]) === nextYear;
}

function civilToday(nowMs = Date.now()) {
  const parts = civilFromDays(Math.floor(Number(nowMs) / 86400000));
  const month = String(parts.month).padStart(2, '0');
  const day = String(parts.day).padStart(2, '0');
  return `${parts.year}-${month}-${day}`;
}

export const VIEW_WITHOUT_SIGN_IN = 'anyone with the trip link can view plans and photos without signing in';

const FIRST_INTAKE_TONE = [
  'Address the customer in the second person. Use customer_name when it is present, copied verbatim. Do not use a customer id, a session id, or a trip id. Do not speak about the customer in the third person.',
  'Echo dates, weekdays, and names exactly as they appear in the facts or in customer_said. Do not shorten a name. Do not calculate a weekday. If weekday or end_weekday is present, use that weekday.',
  'Do not use a relative month phrase unless when_relative is true. Otherwise say the year.',
  'Tone: warm and plain, with contractions. No sales voice. At most one exclamation point. No emoji.',
  'Say place, activity, or day. Do not use EULA, terms, or seat.',
].join('\n');

export const FIRST_INTAKE_VOICE_INSTRUCTION = [
  'You are writing the first reply after the customer\'s intake in the TimeSyncher vacation app. Write it in your own words from the intake facts. Do not copy this instruction back.',
  'Do all of the following in this one message, in order:',
  '1. Confirm the itinerary is being built. Reflect where, the dates, the end date, the number of nights, who is coming, lodging, and the planned activities, when those are in customer_said or the other intake facts. Leave out any of those that are absent. Do not invent a place, a date, a lodging, an activity, a weekday, or a name.',
  '2. When collaborators is present, those people already have contact on file; you may say they can be invited when the customer is ready — never that you added, invited, sent, or will add them on this turn unless turnInvite says the invite was emailed. Do not say they are already collaborators or that they already have access. Do not invent party facts. Do not name anyone who is not in collaborators, who, or customer_said.',
  '3. When invite_contact_needed is true, do not mention adding or inviting anyone. End with exactly one question asking for their name and email so you can invite them.',
  '4. Otherwise end with exactly one question, about the most important missing detail. gaps is ordered with the most important first. If a gap is already answered in customer_said, skip it and use the next one. If gaps is empty, ask one question about what they still left undecided. Never ask a second question.',
  FIRST_INTAKE_TONE,
].join('\n');

export const FIRST_INTAKE_GAP_INSTRUCTION = [
  'You are writing the first reply after a short or vague intake in the TimeSyncher vacation app. Write it in your own words from the intake facts. Do not copy this instruction back.',
  'Start the trip draft anyway, as a short draft.',
  'Then nudge them to send a voice note.',
  'Do not offer to add collaborators. Do not pitch a plan.',
  'Use only customer_said and the other intake facts. Do not invent a place, a date, a lodging, a plan, or a name.',
  FIRST_INTAKE_TONE,
].join('\n');

export const FIRST_INTAKE_QUESTION_INSTRUCTION = [
  'You are writing the first reply in the TimeSyncher vacation app. The customer asked a direct question. Write it in your own words from the intake facts. Do not copy this instruction back.',
  'Answer the question first. When view_without_sign_in is present, use that fact for a question about viewing without signing in.',
  'Offer to add the person they mentioned. Do not add a collaborator who has no name or contact. Ask for their name and contact in that one question.',
  'Do not say they are already a collaborator or that they already have access. Do not invent party facts. Do not say it is just the two of you, or just you and him, unless customer_said says that.',
  'Use only customer_said and the other intake facts. Do not invent a place, a date, a lodging, a plan, or a name.',
  'End with exactly one question. Never ask a second question.',
  FIRST_INTAKE_TONE,
].join('\n');

export function intakeFactText(value, max = 240) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text ? text.slice(0, max) : '';
}

function looksLikeCustomerId(value) {
  const text = String(value || '').trim();
  if (!text) return false;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text)) return true;
  if (/^[0-9a-f]{24,}$/i.test(text)) return true;
  if (/^\d{6,}$/.test(text)) return true;
  return false;
}

export function intakeCustomerName(session) {
  const named = sessionFirstName(session);
  if (!named || looksLikeCustomerId(named)) return '';
  return named;
}

function namedPerson(value, ids = []) {
  const name = intakeFactText(value, 80);
  if (!name || looksLikeCustomerId(name)) return '';
  if (ids.some((id) => name === id || name.includes(id))) return '';
  if (/^(?:he|she|they|him|her|them|someone|somebody)$/i.test(name)) return '';
  return name;
}

function personContact(person) {
  return intakeFactText(person?.email || person?.contact || person?.phone, 120);
}

function rosterContactForName(roster, name) {
  const target = String(name || '').trim().toLowerCase();
  if (!target) return '';
  for (const person of Array.isArray(roster) ? roster : []) {
    const rosterName = namedPerson(person?.name, []);
    if (!rosterName || rosterName.toLowerCase() !== target) continue;
    return personContact(person);
  }
  return '';
}

function collaboratorMayBeOffered(name, roster) {
  const contact = rosterContactForName(roster, name);
  return Boolean(contact);
}

function samePersonName(left, right) {
  const normalize = (value) => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const a = normalize(left);
  const b = normalize(right);
  if (!a || !b) return false;
  if (a === b) return true;
  const aFirst = a.split(' ')[0];
  const bFirst = b.split(' ')[0];
  return aFirst.length >= 2 && bFirst.length >= 2 && aFirst === bFirst;
}

export function hiddenIds(session = {}, extra = []) {
  const ids = [];
  for (const value of [session.customer_id, session.customerId, session.id, session.token, session.trip_id, session.tripId, session.session_id, session.sessionId, ...extra]) {
    const text = String(value || '').trim();
    if (text.length >= 8 && !ids.includes(text)) ids.push(text);
  }
  return ids;
}

function scrubValue(value, ids) {
  if (typeof value !== 'string' || !ids.length) return value;
  let text = value;
  for (const id of ids) if (text.includes(id)) text = text.split(id).join(' ');
  return text.replace(/\s+/g, ' ').trim();
}

function scrubFacts(facts, ids) {
  if (!ids.length) return facts;
  for (const key of Object.keys(facts)) {
    if (key === 'plan') continue;
    const value = facts[key];
    if (typeof value === 'string') {
      const next = scrubValue(value, ids);
      if (next) facts[key] = next;
      else delete facts[key];
    } else if (Array.isArray(value) && value.every((item) => typeof item === 'string')) {
      const next = value.map((item) => scrubValue(item, ids)).filter(Boolean);
      if (next.length) facts[key] = next;
      else delete facts[key];
    }
  }
  return facts;
}

function nightsBetween(start, end) {
  if (!start || !end) return null;
  const startMs = Date.parse(`${start}T00:00:00Z`);
  const endMs = Date.parse(`${end}T00:00:00Z`);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return null;
  return Math.round((endMs - startMs) / 86400000);
}

function isDirectQuestion(said) {
  const text = String(said || '').trim();
  if (!text.includes('?')) return false;
  const words = text.split(/\s+/).filter(Boolean).length;
  return words > 0 && words <= 40;
}

function asksViewWithoutSignIn(said) {
  return /\bview(?:ing)?\b/i.test(said) && /\b(?:sign(?:ing)?[\s-]?in|log(?:ging)?[\s-]?in)\b/i.test(said);
}

function uniqueFactNames(list, max = 80) {
  const seen = new Set();
  const names = [];
  for (const item of list) {
    const name = intakeFactText(item, max);
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }
  return names;
}

export function firstIntakeReplyFacts({
  customerTurn = '',
  tripTitle = '',
  wantedThings = [],
  roster = [],
  extractedDestination = '',
  savedDates = '',
  savedStart = '',
  savedEnd = '',
  planOwned = false,
  planPrice = null,
  ownerPlan = null,
  tripId = '',
  customerName = '',
  session = null,
  ids = [],
  today = '',
} = {}) {
  const hidden = Array.isArray(ids) ? ids.filter((id) => String(id || '').trim().length >= 8) : [];
  const said = scrubValue(intakeFactText(customerTurn, 6000), hidden);
  const customer = namedPerson(customerName, hidden);
  const lodging = [];
  const plans = [];
  const mentioned = [];
  const offer = [];
  let inviteContactNeeded = false;
  const childNames = new Set();
  for (const person of Array.isArray(roster) ? roster : []) {
    const name = namedPerson(person?.name, hidden);
    const role = intakeFactText(person?.role, 40).toLowerCase();
    if (!name || role !== 'child') continue;
    childNames.add(name.toLowerCase());
    mentioned.push(name);
  }
  for (const thing of Array.isArray(wantedThings) ? wantedThings : []) {
    const label = intakeFactText(thing?.name || thing?.title, 180);
    const kind = intakeFactText(thing?.kind || thing?.category, 40).toLowerCase();
    const person = namedPerson(thing?.who, hidden);
    const when = intakeFactText(thing?.when || thing?.whenLabel || thing?.customerWhen, 180);
    if (person) {
      mentioned.push(person);
      if (!childNames.has(person.toLowerCase())) {
        if (collaboratorMayBeOffered(person, roster)) offer.push(person);
        else inviteContactNeeded = true;
      }
    }
    if (!label) continue;
    const line = when ? `${label} (${when})` : label;
    if (kind === 'hotel') lodging.push(line);
    else plans.push(line);
  }
  for (const person of Array.isArray(roster) ? roster : []) {
    const name = namedPerson(person?.name, hidden);
    const role = intakeFactText(person?.role, 40).toLowerCase();
    const contact = personContact(person);
    if (!name || role === 'viewer' || role === 'editor' || role === 'child') continue;
    if (role === 'owner' && customer && samePersonName(name, customer)) continue;
    mentioned.push(name);
    if (contact) offer.push(name);
    else if (role === 'collaborator' || role === '' || role === 'owner') inviteContactNeeded = true;
  }
  const who = uniqueFactNames(mentioned);
  const collaborators = uniqueFactNames(offer);
  const where = intakeFactText(extractedDestination, 180);
  const start = isoDay(savedStart) || isoDay(String(savedDates || '').split(/\s+to\s+/i)[0]);
  const end = isoDay(savedEnd) || isoDay(String(savedDates || '').split(/\s+to\s+/i)[1]);
  const when = [start, end].filter(Boolean).join(' to ') || intakeFactText(savedDates, 180);
  const nightCount = nightsBetween(start, end);
  const saidNights = nightCount == null ? String(said || '').match(/\b(\d{1,3})\s+nights?\b/i) : null;
  const nights = nightCount == null && saidNights ? Number(saidNights[1]) : nightCount;
  const stay = lodging.join('; ');
  const planItems = uniqueFactNames(plans, 180);
  const words = said ? said.split(/\s+/).filter(Boolean).length : 0;
  const named = who.length > 0;
  const grounded = Boolean(where || when || stay || planItems.length);
  const voiceNote = named && ((words >= 40 && grounded) || words >= 70);
  const question = !voiceNote && isDirectQuestion(said);
  const gaps = [];
  if (!where) gaps.push('where');
  if (!when && nights == null) gaps.push('when');
  if (!named) gaps.push('who');
  if (!stay) gaps.push('lodging');
  if (!planItems.length) gaps.push('plans');
  const planReply = voiceNote || (!question && named && where && (Boolean(when) || nights != null));
  const facts = { shape: planReply ? 'voice-note' : question ? 'question' : 'gaps',
    customer_said: said || null };
  const title = intakeFactText(tripTitle, 180);
  const name = namedPerson(customerName, hidden);
  if (name) facts.customer_name = name;
  if (title) facts.tripTitle = title;
  if (where) facts.where = where;
  if (start) facts.start = start;
  if (end) facts.end = end;
  const startWeekday = weekdayForIso(start);
  const endWeekday = weekdayForIso(end);
  if (startWeekday) facts.weekday = startWeekday;
  if (endWeekday) facts.end_weekday = endWeekday;
  facts.when_relative = start ? whenRelativeToToday(start, today) : false;
  if (nights != null) facts.nights = nights;
  if (when) facts.when = when;
  if (who.length) facts.who = who;
  if (stay) facts.lodging = stay;
  if (planItems.length) { facts.activities = planItems; facts.plans = planItems; }
  if (question) {
    if (asksViewWithoutSignIn(said)) facts.view_without_sign_in = VIEW_WITHOUT_SIGN_IN;
    if (/\b(?:he|she|they|him|her|them|someone|somebody)\b/i.test(said)) facts.missing_name = true;
    return scrubFacts(facts, hidden);
  }
  facts.gaps = gaps;
  if (!planReply) return scrubFacts(facts, hidden);
  if (inviteContactNeeded) {
    facts.invite_contact_needed = true;
    if (!gaps.includes('invite_contact')) gaps.unshift('invite_contact');
    facts.gaps = gaps;
  }
  if (collaborators.length) facts.collaborators = collaborators;
  if (isCollaboratorAppSeat(session)) return scrubFacts(facts, hidden);
  if (!ownerPlan || typeof ownerPlan !== 'object') failReplyPlanEntitlement('owner_plan_missing', tripId);
  const purchasedPlan = String(ownerPlan.checkout_plan || '').trim();
  const plan = {
    purchased_plan: purchasedPlan,
    plan_id: String(ownerPlan.plan_id || '').trim(),
    plan_name: String(ownerPlan.plan_name || '').trim(),
    plan_owned: true,
    order_bump_owned: planOwned === true || ownerPlan.order_bump_owned === true,
  };
  if (!plan.plan_id || !plan.plan_name) failReplyPlanEntitlement('owner_plan_incomplete', tripId);
  const price = Number(planPrice);
  if (Number.isFinite(price) && price > 0) plan.price = price;
  facts.plan = plan;
  return scrubFacts(facts, hidden);
}

export function firstIntakeReplyPrompt(input = {}) {
  const facts = firstIntakeReplyFacts(input);
  const instruction = facts.shape === 'voice-note'
    ? FIRST_INTAKE_VOICE_INSTRUCTION
    : facts.shape === 'question'
      ? FIRST_INTAKE_QUESTION_INSTRUCTION
      : FIRST_INTAKE_GAP_INSTRUCTION;
  return `${instruction}\n\nIntake facts: ${JSON.stringify(facts)}`;
}
