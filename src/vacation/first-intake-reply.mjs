import { callTieredModel, jevPrecall } from '../../scripts/vacation-app-reply-rules.mjs';
import { appTextBanned, loadSavedTripRecord } from './live-app-turn.mjs';

function sessionFirstName(session) {
  const first = String(session?.first_name || session?.firstName || '').trim();
  if (first) return first.split(/\s+/)[0];
  const display = String(session?.display_name || session?.displayName || session?.customerName || '').trim();
  if (display) return display.split(/\s+/)[0];
  return '';
}

function isoDay(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  const match = String(value ?? '').match(/\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : '';
}

export const YEARLY_PLAN_ID = 'timesyncher_vacation_unlimited';

export const VIEW_WITHOUT_SIGN_IN = 'anyone with the trip link can view plans and photos without signing in';

const FIRST_INTAKE_LEAK = /\b(?:tier|route|model|jev)\b/i;

const FIRST_INTAKE_TONE = [
  'Address the customer in the second person. Use customer_name when it is present. Do not use a customer id. Do not speak about the customer in the third person.',
  'Tone: warm and plain, with contractions. No sales voice. At most one exclamation point. No emoji.',
  'Say place, activity, or day. Do not use EULA, terms, or seat.',
].join('\n');

export const FIRST_INTAKE_VOICE_INSTRUCTION = [
  'You are writing the first reply after the customer\'s intake in the TimeSyncher vacation app. Write it in your own words from the intake facts. Do not copy this instruction back.',
  'Do all of the following in this one message, in order:',
  '1. Confirm the itinerary is being built. Reflect where, the dates, the end date, the number of nights, who is coming, lodging, and the planned activities, when those are in customer_said or the other intake facts. Leave out any of those that are absent. Do not invent a place, a date, a lodging, an activity, or a name.',
  '2. Offer to add each person in collaborators, as a statement, not a question. Say you will not grant view or edit until they agree. Do not grant view or edit in this message, including to children. Do not name anyone who is not in collaborators, who, or customer_said.',
  '3. Pitch the yearly plan. Identify that plan only by plan.plan_id and the other plan fields. You write the description. Do not state a price unless plan includes a price.',
  '4. End with exactly one question, about the most important missing detail. gaps is ordered with the most important first. If a gap is already answered in customer_said, skip it and use the next one. If gaps is empty, ask one question about what they still left undecided. Never ask a second question.',
  FIRST_INTAKE_TONE,
].join('\n');

export const FIRST_INTAKE_GAP_INSTRUCTION = [
  'You are writing the first reply after a short or vague intake in the TimeSyncher vacation app. Write it in your own words from the intake facts. Do not copy this instruction back.',
  'Start the trip draft anyway.',
  'Ask where they are going and for how long. Then nudge them to send a voice note.',
  'Do not offer to add collaborators. Do not pitch a plan.',
  'Use only customer_said and the other intake facts. Do not invent a place, a date, a lodging, a plan, or a name.',
  FIRST_INTAKE_TONE,
].join('\n');

export const FIRST_INTAKE_QUESTION_INSTRUCTION = [
  'You are writing the first reply in the TimeSyncher vacation app. The customer asked a direct question. Write it in your own words from the intake facts. Do not copy this instruction back.',
  'Answer the question first. When view_without_sign_in is present, use that fact for a question about viewing without signing in.',
  'Do not add a collaborator who has no name or contact. Ask for the name instead.',
  'Do not invent party facts. Do not say it is just the two of you unless customer_said says that.',
  'Use only customer_said and the other intake facts. Do not invent a place, a date, a lodging, a plan, or a name.',
  'End with exactly one question. Never ask a second question.',
  FIRST_INTAKE_TONE,
].join('\n');

function intakeFactText(value, max = 240) {
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

function namedPerson(value) {
  const name = intakeFactText(value, 80);
  if (!name || looksLikeCustomerId(name)) return '';
  if (/^(?:he|she|they|him|her|them|someone|somebody)$/i.test(name)) return '';
  return name;
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

export function firstIntakeReplyLeak(reply) {
  return FIRST_INTAKE_LEAK.test(String(reply || ''));
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
  customerName = '',
} = {}) {
  const said = intakeFactText(customerTurn, 6000);
  const lodging = [];
  const plans = [];
  const mentioned = [];
  const offer = [];
  const childNames = new Set();
  for (const person of Array.isArray(roster) ? roster : []) {
    const name = namedPerson(person?.name);
    const role = intakeFactText(person?.role, 40).toLowerCase();
    if (!name || role !== 'child') continue;
    childNames.add(name.toLowerCase());
    mentioned.push(name);
  }
  for (const thing of Array.isArray(wantedThings) ? wantedThings : []) {
    const label = intakeFactText(thing?.name || thing?.title, 180);
    const kind = intakeFactText(thing?.kind || thing?.category, 40).toLowerCase();
    const person = namedPerson(thing?.who);
    const when = intakeFactText(thing?.when || thing?.whenLabel || thing?.customerWhen, 180);
    if (person) {
      mentioned.push(person);
      if (!childNames.has(person.toLowerCase())) offer.push(person);
    }
    if (!label) continue;
    const line = when ? `${label} (${when})` : label;
    if (kind === 'hotel') lodging.push(line);
    else plans.push(line);
  }
  for (const person of Array.isArray(roster) ? roster : []) {
    const name = namedPerson(person?.name);
    const role = intakeFactText(person?.role, 40).toLowerCase();
    const contact = intakeFactText(person?.email || person?.contact || person?.phone, 120);
    if (!name || role === 'viewer' || role === 'editor' || role === 'child') continue;
    if (role === 'collaborator' || contact || role === '') {
      mentioned.push(name);
      offer.push(name);
    }
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
  const facts = {
    shape: voiceNote ? 'voice-note' : question ? 'question' : 'gaps',
    customer_said: said || null,
  };
  const title = intakeFactText(tripTitle, 180);
  const name = namedPerson(customerName);
  if (name) facts.customer_name = name.split(/\s+/)[0];
  if (title) facts.tripTitle = title;
  if (where) facts.where = where;
  if (start) facts.start = start;
  if (end) facts.end = end;
  if (nights != null) facts.nights = nights;
  if (when) facts.when = when;
  if (who.length) facts.who = who;
  if (stay) facts.lodging = stay;
  if (planItems.length) {
    facts.activities = planItems;
    facts.plans = planItems;
  }
  if (question) {
    if (asksViewWithoutSignIn(said)) facts.view_without_sign_in = VIEW_WITHOUT_SIGN_IN;
    if (/\b(?:he|she|they|him|her|them|someone|somebody)\b/i.test(said)) facts.missing_name = true;
    return facts;
  }
  facts.gaps = gaps;
  if (!voiceNote) return facts;
  if (collaborators.length) facts.collaborators = collaborators;
  const plan = { plan_id: YEARLY_PLAN_ID, plan_owned: planOwned === true };
  const price = Number(planPrice);
  if (Number.isFinite(price) && price > 0) plan.price = price;
  facts.plan = plan;
  return facts;
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

export async function produceFirstIntakeReply({
  customerTurn = '',
  session = null,
  tripTitle = '',
  env = process.env,
  rules = null,
  wantedThings = [],
  roster = null,
  extractedDestination = '',
} = {}) {
  if (!rules?.ok) {
    return { reply: null, rules, jev: null, model: null, reason: rules?.error || 'reply_rules_unloaded' };
  }
  const jevStarted = Date.now();
  const jev = await jevPrecall({
    customerTurn,
    stage: 'vacation_conversation',
    screen: 'vacation-app',
    session: { seed_id: session?.token || null },
    env,
  });
  if (jev && typeof jev === 'object') jev.jevLatencyMs = Math.max(0, Date.now() - jevStarted);
  if (!jev?.jevRan) {
    return { reply: null, rules, jev, model: null, reason: jev?.error || 'jev_skipped' };
  }
  jev.jevBeforeModel = true;
  const saved = await loadSavedTripRecord(session, env);
  const savedStart = saved?.start || '';
  const savedEnd = saved?.end || '';
  const factInput = {
    customerTurn,
    tripTitle,
    wantedThings,
    roster,
    extractedDestination: intakeFactText(extractedDestination, 180) || intakeFactText(saved?.destination, 180),
    savedStart,
    savedEnd,
    savedDates: isoDay(savedStart) && isoDay(savedEnd) ? `${isoDay(savedStart)} to ${isoDay(savedEnd)}` : '',
    planOwned: saved?.planOwned === true,
    customerName: intakeCustomerName(session),
  };
  const facts = firstIntakeReplyFacts(factInput);
  const prompt = firstIntakeReplyPrompt(factInput);
  let model = null;
  let reply = '';
  let block = '';
  for (let attempt = 0; attempt < 2 && !reply; attempt += 1) {
    const genStarted = Date.now();
    model = await callTieredModel({
      rules,
      jev,
      customerTurn,
      stage: 'vacation_conversation',
      screen: 'vacation-app',
      destination: facts.where || '',
      memory: [],
      upsell: facts.shape === 'voice-note' ? 'allow-once' : 'forbidden',
      postIntake: true,
      intakeReplyTurn: true,
      replyFacts: facts,
      env,
      systemExtra: prompt,
    });
    if (model && typeof model === 'object') model.genLatencyMs = Math.max(0, Date.now() - genStarted);
    reply = model?.called && model.text ? String(model.text).trim() : '';
    block = intakeReplyBlock(reply, appTextBanned);
    if (block) reply = '';
  }
  if (!reply) {
    const visible = model?.called && model.text ? String(model.text).trim() : '';
    return {
      reply: null,
      rules,
      jev,
      model,
      reason: (visible && intakeReplyBlock(visible, appTextBanned)) || model?.reason || 'first intake reply model returned no reply',
    };
  }
  return { reply, rules, jev, model, reason: null };
}

function intakeReplyBlock(reply, appTextBanned) {
  const banned = appTextBanned(reply);
  if (banned && banned !== 'app reply text is empty') return banned;
  if (String(reply || '').trim() && firstIntakeReplyLeak(reply)) return 'first_intake_reply_flagged';
  return '';
}

