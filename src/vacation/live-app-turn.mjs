import {
  DIALOG_TEST_FINGERPRINT,
  callTieredModel,
  INTERIM_MODEL,
  isBakeoffModelId,
  jevPrecall,
  jevQualityRewrite,
  JEV_QUALITY_MODEL,
  loadVacationAppReplyRules,
} from '../../scripts/vacation-app-reply-rules.mjs';

import { DESTINATION_ASK, resolveTripDestination } from './trip-destination.mjs';
import { activityCommits, customerIntent, emptyIntent } from './customer-intent.mjs';
import { customerInputState } from './intake-shared-trip.mjs';
import { payerLineFromDollars, priceAnswered } from './seat-price.mjs';

export const LIVE_TRANSCRIPT_CAPTURE = 'live-vacation-app';
export const LIVE_REPLY_PRODUCER = 'vacation-app-reply-rules';
export const LIVE_OPENER_PRODUCER = 'vacation-app-onboarding-opener';
export const FIXED_OPENER_REASON = 'fixed_onboarding_opener';
export const LIVE_DISPATCHER = 'product-gbrain-dispatch';

export function tripIsReturning(trip) {
  if (!trip || typeof trip !== 'object') return false;
  const meta = trip.metadata && typeof trip.metadata === 'object' ? trip.metadata : {};
  if (trip.intakeShare === true || meta.intakeShare === true) return false;
  const slug = String(trip.shareToken || trip.publicSlug || meta.publicSlug || meta.shareToken || meta.sharedToken || '');
  const url = String(trip.publicUrl || meta.publicUrl || meta.public_url || '');
  if (/^intake-/i.test(slug) || /\/shared\/intake-/i.test(url)) return false;
  return Boolean(url.trim() || slug.trim());
}

export function onboardingOpenerFacts({ returning = false, tripTitle = '' } = {}) {
  const title = String(tripTitle || '').trim();
  return {
    first_message: true,
    customer_said: null,
    returning_trip: Boolean(returning),
    site_ready: Boolean(returning),
    trip_title: title || null,
  };
}

export const ONBOARDING_WELCOME_INSTRUCTION = [
  'You are writing the first welcome in the TimeSyncher vacation app. The customer has not typed yet. Write it in your own words from the welcome facts. Do not copy this instruction back.',
  'Audience comes from the facts. Follow only that audience.',
  'Owner welcome, in this order, as three short paragraphs of about 90 to 150 words. Never a one-line reply.',
  '1. Warm greeting by firstName, plus a confirmation that they are set up. If firstName is absent, use a warm greeting with no name.',
  '2. Put the website up front. Their trip already has its own site at tripSiteUrl. Anyone with the link can see plans and photos without signing in. Use the tripSiteUrl fact exactly.',
  '3. In two or three sentences, say how it works: they describe the trip, and the app builds a day-by-day itinerary on the site, including lodging, each day\'s plans, and notes for each day and place. During the trip, the family adds photos, videos, and stories, and at the end it all becomes a keepsake.',
  '4. Ask for one long voice note. Ask them to hold the mic and talk for a minute or two about where and when, who is coming, where they are staying, what they are excited about, and what is still undecided. Rough or rambling is fine, and you will follow up on gaps. The voice-note ask is the last sentence. Stop there.',
  'Collaborator welcome, about 40 to 70 words.',
  '1. Greet them by collaboratorFirstName and say that ownerFirstName added them to tripTitle. If a name or title is absent, leave it out.',
  '2. Share tripSiteUrl.',
  '3. Explain what they can do: add ideas, photos, videos, and notes to any day or place.',
  '4. Ask one open question about what they are looking forward to, or invite a voice note.',
  'Tone: warm and plain, like a friendly travel-savvy friend, with contractions. No sales voice. At most one exclamation point. No emoji.',
  'Do not use these words: Thing, Things, EULA, terms, agreement, seat. No payments, bookings, or reservation offers. No upsell and no unlimited-plan pitch. Do not push a collaborator invite. If collaborators are in the facts, one short clause that a named person can join is allowed. No bare destination question. Do not invent a place, an example place, or any name that is not in the facts. If plan is in the facts, do not pitch it and do not mention a price. Leave missing facts out.',
].join('\n');

function welcomeName(value) {
  const text = String(value || '').trim();
  return text ? text.split(/\s+/)[0] : '';
}

export function onboardingWelcomeFacts({
  audience = 'owner',
  firstName = '',
  ownerFirstName = '',
  collaboratorFirstName = '',
  tripSiteUrl = '',
  tripTitle = '',
  plan = '',
  collaborators = [],
} = {}) {
  const site = String(tripSiteUrl || '').trim();
  const title = String(tripTitle || '').trim();
  const people = (Array.isArray(collaborators) ? collaborators : []).map((name) => welcomeName(name)).filter(Boolean);
  if (audience === 'collaborator') {
    const facts = { audience: 'collaborator', tripSiteUrl: site };
    const owner = welcomeName(ownerFirstName);
    const collaborator = welcomeName(collaboratorFirstName);
    if (owner) facts.ownerFirstName = owner;
    if (collaborator) facts.collaboratorFirstName = collaborator;
    if (title) facts.tripTitle = title;
    return facts;
  }
  const facts = {
    audience: 'owner',
    first_message: true,
    customer_said: null,
    tripSiteUrl: site,
  };
  const name = welcomeName(firstName);
  if (name) facts.firstName = name;
  if (title) facts.tripTitle = title;
  const planName = String(plan || '').trim();
  if (planName) facts.plan = planName;
  if (people.length) facts.collaborators = people;
  return facts;
}

export function onboardingWelcomePrompt(input = {}) {
  const facts = onboardingWelcomeFacts(input);
  return `${ONBOARDING_WELCOME_INSTRUCTION}\n\nWelcome facts: ${JSON.stringify(facts)}`;
}

const WELCOME_BANNED = /\b(?:Things?|EULA|terms|agreement|Jev)\b|\b(?:seats?|tiers?|models?)\b|\baccount tier\b|\b(?:payments?|bookings?|reservations?)\b|\bunlimited\b/i;

export function validateOnboardingWelcome(text, { audience = 'owner', tripSiteUrl = '', allowedPlaces = [] } = {}) {
  const value = String(text || '').trim();
  const errors = [];
  if (!value) errors.push('empty');
  const site = String(tripSiteUrl || '').trim();
  if (site && !value.includes(site)) errors.push('missing_site_url');
  if (WELCOME_BANNED.test(value)) errors.push('banned_wording');
  const words = value.split(/\s+/).filter(Boolean);
  if (audience === 'collaborator') {
    if (words.length < 40 || words.length > 70) errors.push('length');
    if (!/voice note|\?/i.test(value)) errors.push('open_question');
  } else {
    if (words.length < 90) errors.push('short');
    const sentences = value.split(/(?<=[.!?])\s+/).map((part) => part.trim()).filter(Boolean);
    const last = sentences.at(-1) || '';
    if (!/voice note/i.test(last)) errors.push('voice_note_ask');
  }
  const allowed = new Set(['i', 'timesyncher']);
  const allowBlob = [site, ...allowedPlaces].join(' ');
  for (const token of allowBlob.match(/[A-Za-z0-9]+/g) || []) allowed.add(token.toLowerCase());
  for (const sentence of value.split(/(?<=[.!?])\s+/)) {
    const tokens = sentence.match(/[A-Za-z][A-Za-z'’-]*/g) || [];
    tokens.forEach((token, index) => {
      if (index === 0) return;
      if (token[0] !== token[0].toUpperCase()) return;
      const bare = token.replace(/['’].*$/, '');
      if (!allowed.has(bare.toLowerCase())) errors.push(`place:${bare}`);
    });
  }
  return { ok: errors.length === 0, errors };
}

export async function produceOnboardingOpener({
  session = null,
  env = process.env,
  audience = 'owner',
  firstName = '',
  ownerFirstName = '',
  collaboratorFirstName = '',
  tripSiteUrl = '',
  tripTitle = '',
  plan = '',
  collaborators = [],
} = {}) {
  const facts = onboardingWelcomeFacts({
    audience,
    firstName: firstName || (audience === 'owner' ? targetPersonFromSession(session) : ''),
    ownerFirstName,
    collaboratorFirstName: collaboratorFirstName || (audience === 'collaborator' ? targetPersonFromSession(session) : ''),
    tripSiteUrl,
    tripTitle,
    plan,
    collaborators,
  });
  if (!facts.tripSiteUrl) {
    return { reply: null, rules: null, jev: null, model: null, reason: 'onboarding welcome missing tripSiteUrl' };
  }
  const rules = await loadVacationAppReplyRules(env);
  if (!rules?.ok) {
    return { reply: null, rules, jev: null, model: null, reason: rules?.error || 'reply_rules_unloaded' };
  }
  const jevStarted = Date.now();
  const jev = await jevPrecall({
    customerTurn: '',
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
  const systemExtra = `${ONBOARDING_WELCOME_INSTRUCTION}\n\nWelcome facts: ${JSON.stringify(facts)}`;
  let model = null;
  let reply = '';
  for (let attempt = 0; attempt < 2 && !reply; attempt += 1) {
    model = await callTieredModel({
      rules,
      jev,
      customerTurn: '',
      stage: 'vacation_conversation',
      screen: 'vacation-app',
      destination: '',
      memory: [],
      upsell: 'forbidden',
      postIntake: false,
      welcomeTurn: true,
      env,
      systemExtra,
    });
    reply = model?.called && model.text ? String(model.text).trim() : '';
    if (appTextBanned(reply)) reply = '';
  }
  if (!reply) {
    const visible = model?.called && model.text ? String(model.text).trim() : '';
    return {
      reply: null,
      rules,
      jev,
      model,
      reason: (visible && appTextBanned(visible)) || model?.reason || 'onboarding opener model returned no reply',
    };
  }
  return { reply, rules, jev, model, reason: null };
}

export const YEARLY_PLAN_ID = 'timesyncher_vacation_unlimited';

export const VIEW_WITHOUT_SIGN_IN = 'anyone with the trip link can view plans and photos without signing in';

const FIRST_INTAKE_LEAK = /\b(?:tier|route|model|jev)\b/i;

const FIRST_INTAKE_TONE = [
  'Address the customer in the second person. Use customer_name when it is present. Do not use a customer id. Do not speak about the customer in the third person.',
  'Tone: warm and plain, with contractions. No sales voice. At most one exclamation point. No emoji.',
  'Do not use these words: Thing, Things, EULA, terms, seat. Say place, activity, or day. No payments, bookings, or reservation offers.',
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

export function looksLikeCustomerId(value) {
  const text = String(value || '').trim();
  if (!text) return false;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text)) return true;
  if (/^[0-9a-f]{24,}$/i.test(text)) return true;
  if (/^\d{6,}$/.test(text)) return true;
  return false;
}

export function intakeCustomerName(session) {
  const named = targetPersonFromSession(session);
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

async function produceFirstIntakeReply({
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
    reply = model?.called && model.text ? String(model.text).trim() : '';
    block = intakeReplyBlock(reply);
    if (block) reply = '';
  }
  if (!reply) {
    const visible = model?.called && model.text ? String(model.text).trim() : '';
    return {
      reply: null,
      rules,
      jev,
      model,
      reason: (visible && intakeReplyBlock(visible)) || model?.reason || 'first intake reply model returned no reply',
    };
  }
  return { reply, rules, jev, model, reason: null };
}

function intakeReplyBlock(reply) {
  const banned = appTextBanned(reply);
  if (banned && banned !== 'app reply text is empty') return banned;
  if (String(reply || '').trim() && firstIntakeReplyLeak(reply)) return 'first_intake_reply_flagged';
  return '';
}

export function customerModality(body) {
  return body?.voiceMode ? 'voice' : 'text';
}

export function targetPersonFromSession(session) {
  const first = String(session?.first_name || session?.firstName || '').trim();
  if (first) return first.split(/\s+/)[0];
  const display = String(session?.display_name || session?.displayName || session?.customerName || '').trim();
  if (display) return display.split(/\s+/)[0];
  return '';
}

export function jevStamp(jev) {
  if (jev?.jevRan === true) {
    return {
      jevRan: true,
      modelTier: jev.modelTier ?? null,
      routeType: jev.routeType || jev.extraContext?.routeType || null,
      extraContext: jev.extraContext ?? null,
      via: jev.via || null,
      responseModel: jev.responseModel || null,
      jevLatencyMs: Number.isFinite(Number(jev.jevLatencyMs)) ? Number(jev.jevLatencyMs) : null,
      jevBeforeModel: jev.jevBeforeModel === true,
    };
  }
  return {
    jevRan: false,
    reason: String(jev?.error || jev?.reason || 'jev_skipped'),
    via: jev?.via || null,
    modelTier: null,
    routeType: null,
    extraContext: null,
  };
}

function scored(value) {
  if (value == null || value === '') return null;
  const score = Number(value);
  if (!Number.isFinite(score) || score < 1 || score > 5) return null;
  return Math.round(score * 1000) / 1000;
}

function rawScore(value) {
  if (value == null || value === '') return null;
  const score = Number(value);
  return Number.isFinite(score) ? score : null;
}

function finiteOrNull(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function runningBuildSha(env = process.env) {
  return String(env.VERCEL_GIT_COMMIT_SHA || env.TIMESYNCHER_BUILD_SHA || '').trim();
}

export function liveTurnRecord({
  turnIndex,
  role,
  modality,
  text,
  at,
  latencyMs,
  sessionE2eMs,
  jev,
  replyProducer = null,
  model = null,
  rules = null,
  speakerName = null,
  intake = false,
  buildSha = runningBuildSha(),
}) {
  const record = {
    turnIndex,
    role,
    modality,
    text: String(text || ''),
    speakerName: speakerName ? String(speakerName) : null,
    at,
    latencyMs,
    sessionE2eMs,
    buildSha: String(buildSha || '').trim() || null,
    jev: jevStamp(jev),
  };
  if (intake === true) record.intake = true;
  if (role === 'app') {
    record.replyProducer = replyProducer || LIVE_REPLY_PRODUCER;
    record.fixedOpener = record.replyProducer === LIVE_OPENER_PRODUCER;
    record.dispatcher = record.fixedOpener ? null : LIVE_DISPATCHER;
    record.invented = false;
    record.modelId = model?.responseModel || (record.fixedOpener ? null : jev?.responseModel) || null;
    record.genLatencyMs = Number.isFinite(Number(model?.genLatencyMs)) ? Number(model.genLatencyMs) : null;
    record.maxTokens = Number.isFinite(Number(model?.maxTokens)) ? Number(model.maxTokens) : null;
    record.jevLatencyMs = Number.isFinite(Number(jev?.jevLatencyMs)) ? Number(jev.jevLatencyMs) : null;
    record.jevBeforeModel = jev?.jevBeforeModel === true && jev?.jevRan === true;
    if (Array.isArray(model?.beats) && model.beats.length) {
      record.beats = model.beats.map((beat) => String(beat || '').trim()).filter(Boolean);
    }
    if (model?.quality?.judged === true) {
      record.quality = {
        judged: true,
        score: scored(model.quality.score),
        scoreRaw: Number.isFinite(Number(model.quality.scoreRaw)) ? Number(model.quality.scoreRaw) : null,
        disposition: model.quality.disposition || null,
        jevFocus: model.quality.jevFocus || null,
        comment: model.quality.comment || null,
        jevNoteReason: model.quality.jevNoteReason || null,
        rewritten: model.quality.rewritten === true,
        model: model.quality.model || null,
        judgeMs: Number.isFinite(Number(model.quality.judgeMs)) ? Number(model.quality.judgeMs) : null,
      };
      if (record.quality.rewritten && model.quality.draft) {
        record.quality.draft = String(model.quality.draft);
      }
      if (record.quality.rewritten && model.quality.rewriteModel) {
        record.quality.rewriteModel = String(model.quality.rewriteModel);
      }
      if (model.quality.shippedModel) record.shippedModel = String(model.quality.shippedModel);
      if (model.quality.draftModel) record.draftModel = String(model.quality.draftModel);
      if (model.quality.rewriteModel) record.rewriteModel = String(model.quality.rewriteModel);
      if (model.quality.rewriteText) record.rewriteText = String(model.quality.rewriteText);
      if (model.quality.draft) record.quality.draft = String(model.quality.draft);
    }
    const log = model?.log && typeof model.log === 'object' ? model.log : null;
    if (log) {
      record.draftModel = log.draftModel || record.draftModel || null;
      record.rewriteModel = log.rewriteModel || record.rewriteModel || null;
      if (log.rewriteText) record.rewriteText = String(log.rewriteText);
      if (log.draftText && record.quality) record.quality.draft = String(log.draftText);
      record.shippedModel = log.shippedModel || record.shippedModel || null;
      record.jevScoreDraft = scored(log.jevScoreDraft);
      record.jevScoreRewrite = scored(log.jevScoreRewrite);
      record.jevScoreRaw = rawScore(log.jevScoreRaw);
      record.jevDisposition = log.jevDisposition || null;
      record.jevFixFocus = log.jevFixFocus || null;
      record.draftJevScoreRaw = rawScore(log.draftJevScoreRaw);
      record.draftJevDisposition = log.draftJevDisposition || null;
      record.draftJevFixFocus = log.draftJevFixFocus || null;
      record.rewriteJevScoreRaw = log.rewriteModel || log.rewriteText ? rawScore(log.rewriteJevScoreRaw) : null;
      record.rewriteJevDisposition = log.rewriteJevDisposition || null;
      record.rewriteJevFixFocus = log.rewriteJevFixFocus || null;
      record.rejudgeMs = finiteOrNull(log.rejudgeMs);
      record.rawModelText = log.rawModelText == null ? null : String(log.rawModelText);
      record.draftFactCheck = log.draftFactCheck || null;
      record.rewriteFactCheck = log.rewriteFactCheck || null;
      if (log.rewriteFailReason) record.rewriteFailReason = String(log.rewriteFailReason);
      if (Array.isArray(log.rewriteAttempts)) record.rewriteAttempts = log.rewriteAttempts;
      record.jevNote = null;
      record.jevNoteReason = log.jevNoteReason || 'jev_no_free_text';
      record.rewriterChange = log.rewriterChange || null;
      record.savedTrip = log.savedTrip || null;
      record.interimReply = log.interimReply || null;
      record.modelLatency = log.latencyMs || null;
      record.flagged = log.flagged === true;
      record.held = log.held === true;
    }
    record.model = model
      ? {
        called: Boolean(model.called),
        via: model.via || null,
        responseModel: model.responseModel || null,
        modelTier: model.modelTier ?? null,
        genLatencyMs: record.genLatencyMs,
      }
      : null;
    record.qualityLine = formatQualityLine(record.quality);
    record.heldRewriteLine = heldRewriteLine(record);
    record.rewriteCredit = rewriteCreditLabel(record.rewriteModel || record.quality?.rewriteModel, record.rewriterChange || record.quality?.rewriterChange);
  }
  if (rules) {
    record.rules = {
      ok: Boolean(rules.ok),
      via: rules.via || null,
      slug: rules.slug || null,
      contentHash: rules.content_hash || null,
    };
  }
  return record;
}

const UNLIMITED_PATTERN = /unlimited vacations for the whole year/i;
const COLLAB_WELCOME = /welcome\b[^.\n]{0,180}\bcollaborat|\bcollaborat\w*[^.\n]{0,180}(?:add notes|help shape the days|whole household|whole family|unlimited vacations)/i;

export function customerTurnText(turn) {
  if (turn && typeof turn === 'object') return String(turn.text || '');
  return String(turn || '');
}

export function turnMarkedIntake(turn) {
  return Boolean(turn && typeof turn === 'object' && turn.intake === true);
}

export function firstMarkedIntake(customerTurn, priorTurns) {
  if (!turnMarkedIntake(customerTurn)) return false;
  const currentText = customerTurnText(customerTurn);
  const priors = Array.isArray(priorTurns) ? [...priorTurns] : [];
  while (priors.length && priors.at(-1)?.role === 'customer' && customerTurnText(priors.at(-1)) === currentText) {
    priors.pop();
  }
  return !priors.some((turn) => turn?.role === 'customer' && turn.intake === true);
}

export function customerPullsAccess(text, intent) {
  return intent?.pullsAccess === true;
}

export function isCollabWelcome(text) {
  return COLLAB_WELCOME.test(String(text || ''));
}

export function isFullUpsell(text) {
  const value = String(text || '');
  return UNLIMITED_PATTERN.test(value) && /collaborat/i.test(value);
}

function openerTurn(turn) {
  return turn?.fixedOpener === true || turn?.replyProducer === LIVE_OPENER_PRODUCER;
}

function sentenceIsUpsell(sentence) {
  return UNLIMITED_PATTERN.test(sentence) || COLLAB_WELCOME.test(sentence);
}

export const ITEM34_BAN = /\b(?:split|splitting)\b/i;

export function customerAsksAccessChoice(text, intent) {
  return intent?.asksAccess === true;
}

export function customerAsksPrice(text, intent) {
  return intent?.asksPrice === true;
}

export function item34BanHit(text) {
  return ITEM34_BAN.test(String(text || ''));
}

const STOCK_REWRITE_LEAD = /^the plan stays on the days and places you named\b/i;
const FALSE_PRICE = /no extra fees|you'?ve got unlimited|you have unlimited|you also have unlimited/i;

export function sessionHasFullUpsell(priorTurns) {
  return (Array.isArray(priorTurns) ? priorTurns : []).some((turn) => {
    if (turn?.role === 'customer') return false;
    const text = String(turn?.text || '');
    if (openerTurn(turn)) return false;
    return isFullUpsell(text);
  });
}

export function upsellModeForTurn(customerTurn, priorTurns, intent) {
  if (sessionHasFullUpsell(priorTurns)) return 'forbidden';
  if (customerPullsAccess(customerTurn, intent) || firstMarkedIntake(customerTurn, priorTurns)) return 'allow-once';
  return 'forbidden';
}

export function upsellAudit(turns) {
  const list = Array.isArray(turns) ? turns : [];
  let full = 0;
  const unsolicitedFull = [];
  const softEmbeds = [];
  const unsolicitedWelcome = [];
  let lastCustomer = '';
  let lastCustomerTurn = null;
  let lastIntent = null;
  const priorCustomers = [];
  for (const turn of list) {
    const text = String(turn?.text || '');
    if (turn?.role !== 'app') {
      if (turn?.role === 'customer') {
        lastCustomer = text;
        lastCustomerTurn = turn;
        lastIntent = turn.intent || null;
        priorCustomers.push(turn);
      }
      continue;
    }
    if (openerTurn(turn)) continue;
    const pulled = customerPullsAccess(lastCustomer, lastIntent)
      || firstMarkedIntake(lastCustomerTurn, priorCustomers.slice(0, -1));
    const phrase = UNLIMITED_PATTERN.test(text);
    const welcome = isCollabWelcome(text);
    const fullBlock = isFullUpsell(text);
    if (fullBlock) {
      full += 1;
      if (!pulled || full > 1) unsolicitedFull.push(turn.turnIndex ?? null);
    } else if (welcome && !pulled) {
      unsolicitedWelcome.push(turn.turnIndex ?? null);
    } else if (phrase && !pulled) {
      softEmbeds.push(turn.turnIndex ?? null);
    }
  }
  return {
    full,
    unsolicitedFull,
    unsolicitedWelcome,
    softEmbeds,
    ok: unsolicitedFull.length === 0 && unsolicitedWelcome.length === 0 && softEmbeds.length === 0 && full <= 1,
  };
}

function memoryTurns(priorTurns) {
  return (Array.isArray(priorTurns) ? priorTurns : []).slice(-12).map((turn) => ({
    role: turn.role === 'app' ? 'app' : 'customer',
    text: String(turn.text || '').slice(0, 1500),
  }));
}

function projectCustomerRecord(priorTurns, customerTurn = '') {
  const corpus = customerCorpus(priorTurns, customerTurn);
  const span = intakeSpan(corpus);
  const party = completeRosterParty({ turns: [{ role: 'customer', text: corpus }] });
  return {
    start: span?.start || '',
    end: span?.end || '',
    span,
    things: [],
    party,
    planOwned: false,
    rule: '',
    addressedTo: (String(customerTurn || '').match(/\bthis is ([A-Z][a-z]+)/i) || [])[1] || '',
  };
}

export function draftingFacts(priorTurns, customerTurn = '', saved = null) {
  const record = saved && typeof saved === 'object' ? saved : projectCustomerRecord(priorTurns, customerTurn);
  const things = Array.isArray(record?.things) ? record.things : [];
  const itinerary = things.map((thing) => {
    const when = String(thing.customerWhen || thing.whenLabel || '').trim();
    return when ? `${thing.title}: ${when}` : thing.title;
  }).filter(Boolean);
  const party = record?.party && typeof record.party === 'object' ? record.party : {};
  const owner = party.primary?.name ? [{ name: party.primary.name, payer: 'account holder' }] : [];
  const travelers = [
    ...owner,
    ...(Array.isArray(party.collaborators) ? party.collaborators : []),
    ...(Array.isArray(party.preference_subjects) ? party.preference_subjects : []),
  ].filter((person) => person?.name);
  const absent = [
    ...(Array.isArray(party.viewers) ? party.viewers.map((person) => person?.name && `${person.name} (viewer)`) : []),
    ...(Array.isArray(party.editors) ? party.editors.map((person) => person?.name && `${person.name} (editor)`) : []),
  ].filter(Boolean);
  const statedLine = 'List only people the customer named in chat. Do not invent people.';
  const holder = owner[0]?.name ? ` The account holder is ${owner[0].name}. A collaborator who just joined is not the account holder.` : '';
  const roster = [
    `Party rule: ${statedLine} Ask the customer for anything they haven't said.`,
    travelers.length ? `Traveling: ${travelers.map((person) => person.payer ? `${person.name} (payer ${person.payer})` : person.name).join(', ')}.${holder}` : '',
    absent.length ? `Not on the trip: ${absent.join(', ')}. Viewers and editors are not coming, not in the house, and not in the day's group.` : '',
  ].filter(Boolean).join(' ');
  const span = record?.span || null;
  const facts = {
    itinerary,
    roster,
    dates: span?.spanLabel ? `Saved trip dates: ${span.spanLabel}.` : '',
    ...customerInputState(things),
    ...customerInputFields(record),
  };
  if (party.askRoster === true) facts.askRoster = true;
  return facts;
}

function customerInputFields(record) {
  if (!record || typeof record !== 'object') return {};
  const fields = {};
  if (Array.isArray(record.needsCustomerInput)) {
    const needsCustomerInput = record.needsCustomerInput.map((item) => String(item || '').trim()).filter(Boolean);
    if (needsCustomerInput.length) fields.needsCustomerInput = needsCustomerInput;
  }
  const flightAsk = String(record.flightAsk || '').trim();
  if (flightAsk) fields.flightAsk = flightAsk;
  return fields;
}

export function qualityFailureReason(quality, flags) {
  const parts = [];
  if (flags?.missingPrice) parts.push('missing dollar line');
  if (flags?.split) parts.push('banned payment word');
  if (flags?.invented?.length) parts.push(`invented place: ${flags.invented.join(', ')}`);
  if (flags?.missingAccess) parts.push('missing view access and edit access');
  const focus = String(quality?.jevFocus || '').trim();
  if (focus && focus !== 'keep') parts.push(`jev fix_focus ${focus}`);
  const accuracy = Array.isArray(quality?.accuracyErrors) ? quality.accuracyErrors : [];
  for (const error of accuracy) {
    const line = String(error || '').trim();
    if (line) parts.push(line);
  }
  const score = Number(quality?.score);
  if (Number.isFinite(score) && score <= 2) parts.push(`score ${score}`);
  return parts.join('; ');
}

function appTextBanned(text) {
  const value = String(text || '');
  if (!value.trim()) return 'app reply text is empty';
  if (value.includes(DIALOG_TEST_FINGERPRINT)) return 'app reply carries the dialog test fingerprint';
  if (/dialog_vacation_test_turn/i.test(value)) return 'app reply came from dialog_vacation_test_turn';
  if (/dialog-pdf-openrouter-selfcall|openrouter-selfcall/i.test(value)) return 'app reply came from an OpenRouter self-call pack';
  return '';
}

export function placeSourceRows(sources) {
  if (!Array.isArray(sources)) return [];
  return sources.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const ref = item.sourceRef && typeof item.sourceRef === 'object' ? item.sourceRef : null;
    const id = String(ref?.id ?? item.id ?? item.poiId ?? item.placeId ?? item.place_id ?? '').trim();
    const name = String(item.name ?? item.title ?? '').trim();
    return id && name ? [{ id, name }] : [];
  });
}

export function savedThingPlaceResults(savedTrip) {
  const things = Array.isArray(savedTrip?.things) ? savedTrip.things : [];
  return things.flatMap((thing) => {
    const sourceRef = thing?.sourceRef && typeof thing.sourceRef === 'object' ? thing.sourceRef : null;
    const id = String(sourceRef?.id || '').trim();
    const name = String(thing?.title || thing?.name || '').trim();
    if (!id || !name) return [];
    return [{ name, sourceRef: { source: String(sourceRef.source || ''), id } }];
  });
}

function spokenPlace(text, index) {
  const before = String(text || '').slice(Math.max(0, index - 80), index);
  return (before.match(/([\p{Lu}][\p{L}\p{M}'’.-]*(?:\s+[\p{Lu}][\p{L}\p{M}'’.-]*)*)\s*$/u) || [])[1] || '';
}

export function unsourcedPlaces(reply, sources) {
  const text = String(reply || '');
  const rows = placeSourceRows(sources);
  const byId = new Map(rows.map((row) => [row.id, row]));
  const flagged = [];
  const cited = new Set();
  for (const match of text.matchAll(/\(id:([^)\s]+)\)/g)) {
    const id = match[1];
    cited.add(id);
    const row = byId.get(id);
    const spoken = spokenPlace(text, match.index);
    if (!row) flagged.push(spoken || id);
    else if (spoken && spoken.toLowerCase() !== row.name.toLowerCase()) flagged.push(spoken);
  }
  for (const row of rows) {
    const named = new RegExp(`(^|[^\\p{L}\\p{N}])${row.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^\\p{L}\\p{N}]|$)`, 'iu').test(text);
    if (named && !cited.has(row.id)) flagged.push(row.name);
  }
  return [...new Set(flagged)];
}

export function inventedVenueNames(reply, sources) {
  return unsourcedPlaces(reply, sources);
}

export function placeResultExtra(sources) {
  const rows = placeSourceRows(sources);
  if (!rows.length) return '';
  return `Results: ${rows.map((row) => `${row.name} (id:${row.id})`).join('; ')}.`;
}

const MONTHS = {
  january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3, april: 4, apr: 4, may: 5,
  june: 6, jun: 6, july: 7, jul: 7, august: 8, aug: 8, september: 9, sept: 9, sep: 9,
  october: 10, oct: 10, november: 11, nov: 11, december: 12, dec: 12,
};
const MONTH_ABBR = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_WORDS = {
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10,
  eleventh: 11, twelfth: 12, thirteenth: 13, fourteenth: 14, fifteenth: 15, sixteenth: 16, seventeenth: 17,
  eighteenth: 18, nineteenth: 19, twentieth: 20, 'twenty-first': 21, 'twenty-second': 22, 'twenty-third': 23,
  'twenty-fourth': 24, 'twenty-fifth': 25, 'twenty-sixth': 26, 'twenty-seventh': 27, 'twenty-eighth': 28,
  'twenty-ninth': 29, thirtieth: 30, 'thirty-first': 31,
};
const WEEKDAY_ABBR = { sunday: 'Sun', monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu', friday: 'Fri', saturday: 'Sat' };

function splitSentences(text) {
  return String(text || '').split(/(?<=[.!?])\s+/).map((part) => part.replace(/\s+/g, ' ').trim()).filter(Boolean);
}

function parseYear(text) {
  const digits = String(text || '').match(/\b(20\d{2})\b/);
  if (digits) return Number(digits[1]);
  const words = String(text || '').toLowerCase();
  const teens = { five: 2025, six: 2026, seven: 2027, eight: 2028, nine: 2029 };
  const match = words.match(/\btwenty[\s-]+twenty[\s-]*(five|six|seven|eight|nine)\b/);
  return match ? teens[match[1]] : null;
}

function parseDayToken(token) {
  const word = String(token || '').toLowerCase();
  if (DAY_WORDS[word]) return DAY_WORDS[word];
  const digits = word.match(/^(\d{1,2})/);
  const day = digits ? Number(digits[1]) : 0;
  return day >= 1 && day <= 31 ? day : 0;
}

export function datedMentions(text) {
  const year = parseYear(text);
  const re = /\b(?:(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)\s+)?(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sept|Sep|Oct|Nov|Dec)\.?\s+(\d{1,2}(?:st|nd|rd|th)?|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|thirteenth|fourteenth|fifteenth|sixteenth|seventeenth|eighteenth|nineteenth|twentieth|twenty-first|twenty-second|twenty-third|twenty-fourth|twenty-fifth|twenty-sixth|twenty-seventh|twenty-eighth|twenty-ninth|thirtieth|thirty-first)\b/gi;
  const found = [];
  let match = re.exec(String(text || ''));
  while (match) {
    const month = MONTHS[match[2].toLowerCase()];
    const day = parseDayToken(match[3]);
    if (month && day) {
      found.push({
        weekday: match[1] || '',
        month,
        day,
        year: parseYear(match[0]) || year,
        raw: match[0],
      });
    }
    match = re.exec(String(text || ''));
  }
  return found;
}

function weekdayAbbr(mention) {
  if (mention?.weekday && WEEKDAY_ABBR[mention.weekday.toLowerCase()]) return WEEKDAY_ABBR[mention.weekday.toLowerCase()];
  if (!mention?.year) return '';
  const date = new Date(Date.UTC(mention.year, mention.month - 1, mention.day));
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][date.getUTCDay()] || '';
}

function formatMention(mention, { withWeekday = true, withYear = false } = {}) {
  if (!mention) return '';
  const weekday = withWeekday ? weekdayAbbr(mention) : '';
  const year = withYear && mention.year ? ` ${mention.year}` : '';
  return `${weekday ? `${weekday} ` : ''}${MONTH_ABBR[mention.month]} ${mention.day}${year}`.trim();
}

export function intakeSpan(text) {
  const mentions = datedMentions(text);
  if (!mentions.length) return null;
  const year = mentions.find((item) => item.year)?.year || parseYear(text);
  const ordered = [...mentions].sort((left, right) => (left.month - right.month) || (left.day - right.day));
  const start = { ...ordered[0], year: ordered[0].year || year };
  const end = { ...ordered[ordered.length - 1], year: ordered[ordered.length - 1].year || year };
  const startIso = start.year ? `${start.year}-${String(start.month).padStart(2, '0')}-${String(start.day).padStart(2, '0')}` : '';
  const endIso = end.year ? `${end.year}-${String(end.month).padStart(2, '0')}-${String(end.day).padStart(2, '0')}` : '';
  const sameMonth = start.month === end.month && start.year === end.year;
  const badgeRange = !endIso || (startIso === endIso)
    ? formatMention(start, { withWeekday: false, withYear: true })
    : (sameMonth
      ? `${MONTH_ABBR[start.month]} ${start.day}–${end.day}${start.year ? ` ${start.year}` : ''}`
      : `${formatMention(start, { withWeekday: false, withYear: false })}–${formatMention(end, { withWeekday: false, withYear: true })}`);
  const spanLabel = startIso === endIso
    ? formatMention(start, { withWeekday: true, withYear: true })
    : `${formatMention(start, { withWeekday: true })}–${formatMention(end, { withWeekday: true, withYear: true })}`;
  return {
    destination: '',
    start: startIso,
    end: endIso || startIso,
    startLabel: formatMention(start, { withWeekday: true }),
    endLabel: formatMention(end, { withWeekday: true, withYear: true }),
    spanLabel,
    badge: badgeRange,
    year: year || null,
  };
}

function mentionsThing(title, sentence) {
  const name = String(title || '').trim();
  if (name.length < 2) return false;
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${escaped}\\b`, 'i').test(String(sentence || ''));
}

function customerNamedWeekday(customerText, weekdayName) {
  if (!weekdayName) return false;
  return new RegExp(`\\b${weekdayName}\\b`, 'i').test(String(customerText || ''));
}

const WEEKDAY_INDEX = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };

function isoDay(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  const match = String(value ?? '').match(/\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : '';
}

function weekdayInsideSpan(weekdayName, span) {
  const target = WEEKDAY_INDEX[String(weekdayName || '').toLowerCase()];
  if (target == null || !span?.start || !span?.end) return '';
  const start = new Date(`${isoDay(span.start)}T00:00:00Z`);
  const end = new Date(`${isoDay(span.end)}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return '';
  for (let cursor = start; cursor <= end; cursor = new Date(cursor.getTime() + 86400000)) {
    if (cursor.getUTCDay() !== target) continue;
    return formatMention({
      weekday: weekdayName,
      month: cursor.getUTCMonth() + 1,
      day: cursor.getUTCDate(),
      year: cursor.getUTCFullYear(),
    }, { withWeekday: true });
  }
  return '';
}

function spanDateLabel(date) {
  return formatMention({
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    year: date.getUTCFullYear(),
  }, { withWeekday: true });
}

function spanStartLabel(span) {
  if (!span?.start) return '';
  const start = new Date(`${isoDay(span.start)}T00:00:00Z`);
  if (Number.isNaN(start.getTime())) return '';
  return spanDateLabel(start);
}

export function applyAgreedAppSwim(things) {
  return Array.isArray(things) ? things : [];
}

function activitySentenceCommits(_hit, decision) {
  if (decision?.ask === true) return false;
  return decision?.commits === true;
}

export async function activityCommitDecisions(text, options) {
  const sentences = splitSentences(text);
  if (!sentences.length) return {};
  return activityCommits(sentences, options);
}

function sameNote(left, right) {
  return String(left || '').replace(/\s+/g, ' ').trim().toLowerCase() === String(right || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

export function applyCustomerNotes(things, text, { collaborator = false, speakerName = '', commits = null } = {}) {
  const sentences = splitSentences(text);
  return (Array.isArray(things) ? things : []).map((thing) => {
    const hits = sentences.filter((part) => mentionsThing(thing.title, part));
    if (!hits.length) return thing;
    const notes = Array.isArray(thing.notes) ? [...thing.notes] : [];
    const collaboratorNotes = Array.isArray(thing.collaboratorNotes) ? [...thing.collaboratorNotes] : [];
    const bucket = collaborator ? collaboratorNotes : notes;
    const decisionFor = (hit) => (commits?.__ask ? { ask: true, commits: false } : commits?.[hit]);
    for (const hit of hits) {
      const line = collaborator && speakerName && !hit.includes(String(speakerName).split(/\s+/)[0])
        ? `${speakerName}: ${hit}`
        : hit;
      if ([...notes, ...collaboratorNotes, ...bucket].some((note) => sameNote(note, line))) continue;
      bucket.push(line);
    }
    const who = String(thing.who || '').trim();
    const labels = String(thing.customerWhen || '').split(' · ').map((part) => part.trim()).filter(Boolean);
    for (const hit of hits) {
      if (!activitySentenceCommits(hit, decisionFor(hit))) continue;
      for (const dated of datedMentions(hit)) {
        const label = formatMention(dated, { withWeekday: true, withYear: Boolean(dated.year) });
        if (label && !labels.some((item) => item === label || item.startsWith(`${label} `))) labels.push(label);
      }
    }
    const customerWhen = labels.join(' · ');
    return {
      ...thing,
      who,
      notes,
      collaboratorNotes,
      customerWhen,
      description: '',
      source: thing.source || (collaborator ? 'collaborator' : 'customer'),
    };
  });
}

export function acceptQualityRewrite(draft, rewritten) {
  const prior = String(draft || '').trim();
  const next = String(rewritten || '').trim();
  if (!next || next.replace(/\s+/g, ' ') === prior.replace(/\s+/g, ' ')) {
    return { text: prior, rewritten: false, draft: '' };
  }
  return { text: next, rewritten: true, draft: prior };
}

export function rewriteCreditLabel(model, change = '') {
  const line = String(change || '').replace(/\s+/g, ' ').trim();
  if (!line) return '';
  return `Rewriter (${String(model || '').trim()}): ${line}`;
}

export function splitRewriteChange(text) {
  const raw = String(text || '').replace(/\r\n/g, '\n').trim();
  const match = raw.match(/(?:^|\n)WHAT_I_CHANGED:\s*(.+)\s*$/i);
  if (!match) return { reply: raw, change: '' };
  return {
    reply: raw.slice(0, match.index).trim(),
    change: match[1].replace(/\s+/g, ' ').trim(),
  };
}

export function verifiedRewriteChange(change) {
  return String(change || '').replace(/\s+/g, ' ').trim();
}

export function mustRewriteQuality(quality) {
  if (quality?.hardFlag === true) return true;
  if (quality?.wantsRewrite === true) return true;
  const score = Number(quality?.score);
  return Number.isFinite(score) && score <= 2;
}

export function stripChatMarkdown(value) {
  return String(value || '')
    .replace(/\*\*([^*\n]+)\*\*/g, '$1')
    .replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,!?;:]|$)/g, '$1$2');
}

const WEEKDAY_NAME = { sun: 'sunday', mon: 'monday', tue: 'tuesday', tues: 'tuesday', wed: 'wednesday', thu: 'thursday', thur: 'thursday', thurs: 'thursday', fri: 'friday', sat: 'saturday' };

function customerCorpus(priorTurns, customerTurn = '') {
  const turns = [...(Array.isArray(priorTurns) ? priorTurns : []), { role: 'customer', text: customerTurn }];
  return turns
    .filter((turn) => turn?.role !== 'app')
    .map((turn) => String(turn?.text || '').trim())
    .filter(Boolean)
    .join('\n');
}

function dayStamp(label) {
  const match = String(label || '').toLowerCase().match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})\b/);
  return match ? `${match[1].slice(0, 3)} ${Number(match[2])}` : '';
}

function mentionStamp(mention) {
  const month = MONTH_ABBR[mention?.month] || '';
  if (!month || !mention?.day) return '';
  return `${month.toLowerCase()} ${Number(mention.day)}`;
}

function rangeBoundDays(sentence) {
  const days = new Set();
  const months = monthPattern();
  const re = new RegExp(`\\b(?:${months})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\s*(?:[\\u2013\\-]|to|through)\\s*(?:the\\s+)?(?:(?:${months})\\.?\\s+)?(\\d{1,2})(?:st|nd|rd|th)?`, 'gi');
  for (const match of String(sentence || '').matchAll(re)) {
    days.add(Number(match[1]));
    days.add(Number(match[2]));
  }
  return days;
}

function activityStamps(sentence, span) {
  const bounds = rangeBoundDays(sentence);
  return looseDayStamps(sentence, span).filter((stamp) => !bounds.has(Number(String(stamp).split(' ')[1])));
}

function looseDayStamps(sentence, span) {
  const dated = datedMentions(sentence).map(mentionStamp).filter(Boolean);
  if (dated.length) return dated;
  const match = String(sentence || '').match(/\b(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sun|Mon|Tue|Tues|Wed|Thu|Thur|Thurs|Fri|Sat)\b(?:[\s,]+(?:the\s+)?)?(\d{1,2})(?:st|nd|rd|th)?\b/i);
  if (!match || !span?.start) return [];
  const month = MONTH_ABBR[Number(String(span.start).slice(5, 7))] || '';
  return month ? [`${month.toLowerCase()} ${Number(match[2])}`] : [];
}

function ordinalWeekdayStamp(sentence, span) {
  const match = String(sentence || '').match(/\b(first|second|third|fourth|fifth|last)\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i);
  if (!match || !span?.start || !span?.end) return '';
  const target = WEEKDAY_INDEX[match[2].toLowerCase()];
  if (target == null) return '';
  const start = new Date(`${isoDay(span.start)}T00:00:00Z`);
  const end = new Date(`${isoDay(span.end)}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return '';
  const hits = [];
  for (let cursor = start; cursor <= end; cursor = new Date(cursor.getTime() + 86400000)) {
    if (cursor.getUTCDay() !== target) continue;
    const month = MONTH_ABBR[cursor.getUTCMonth() + 1] || '';
    if (month) hits.push(`${month.toLowerCase()} ${cursor.getUTCDate()}`);
  }
  if (!hits.length) return '';
  if (match[1].toLowerCase() === 'last') return hits[hits.length - 1];
  const index = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5 }[match[1].toLowerCase()];
  return index ? (hits[index - 1] || '') : '';
}

function weekdayName(sentence) {
  const match = String(sentence || '').match(/\b(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sun|Mon|Tue|Tues|Wed|Thu|Thur|Thurs|Fri|Sat)\b/i);
  if (!match) return '';
  const word = match[1].toLowerCase();
  return WEEKDAY_NAME[word] || word;
}

function endWeekday(span) {
  if (!span?.end) return '';
  const date = new Date(`${String(span.end).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return '';
  return ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][date.getUTCDay()] || '';
}

function endDayNumber(span) {
  if (!span?.end) return 0;
  return Number(String(span.end).slice(8, 10)) || 0;
}

function commitsDay(sentence) {
  if (/\?/.test(sentence)) return false;
  if (/\bor\b/i.test(sentence)) return false;
  return true;
}

function spanFromIso(startIso, endIso) {
  const start = String(startIso || '').slice(0, 10);
  const end = String(endIso || start).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return null;
  const startDate = new Date(`${start}T00:00:00Z`);
  const endDate = new Date(`${end}T00:00:00Z`);
  if (Number.isNaN(startDate.getTime())) return null;
  const startMention = { month: startDate.getUTCMonth() + 1, day: startDate.getUTCDate(), year: startDate.getUTCFullYear() };
  const endMention = Number.isNaN(endDate.getTime())
    ? startMention
    : { month: endDate.getUTCMonth() + 1, day: endDate.getUTCDate(), year: endDate.getUTCFullYear() };
  return {
    start,
    end: Number.isNaN(endDate.getTime()) ? start : end,
    startLabel: formatMention(startMention, { withWeekday: true }),
    endLabel: formatMention(endMention, { withWeekday: true, withYear: true }),
    spanLabel: `${formatMention(startMention, { withWeekday: true })}–${formatMention(endMention, { withWeekday: true, withYear: true })}`,
    year: startMention.year,
  };
}

function stampsFromWhen(value) {
  return [...new Set(String(value || '').split('·').map((part) => dayStamp(part)).filter(Boolean))];
}

export function savedTripFacts(record = {}) {
  const things = Array.isArray(record.things) ? record.things : [];
  const span = record.span?.end ? record.span : spanFromIso(record.start, record.end);
  const party = record.party && typeof record.party === 'object' ? record.party : {};
  const notTraveling = [
    ...(Array.isArray(party.viewers) ? party.viewers : []).map((person) => ({ name: person?.name, role: 'viewer' })),
    ...(Array.isArray(party.editors) ? party.editors : []).map((person) => ({ name: person?.name, role: 'editor' })),
  ].filter((person) => person.name);
  const activities = things.map((thing) => String(thing?.title || '').toLowerCase()).filter(Boolean);
  return {
    span,
    owners: {},
    planOwned: record.planOwned === true,
    activities,
    notTraveling,
    travelers: [
      party.primary?.name,
      ...(Array.isArray(party.collaborators) ? party.collaborators.map((person) => person?.name) : []),
      ...(Array.isArray(party.preference_subjects) ? party.preference_subjects.map((person) => person?.name) : []),
    ].filter(Boolean),
    ownerName: party.primary?.name || '',
    rule: String(record.rule || ''),
    addressedTo: String(record.addressedTo || ''),
    corpus: '',
  };
}

export function customerTripFacts(priorTurns, customerTurn = '') {
  return savedTripFacts(projectCustomerRecord(priorTurns, customerTurn));
}

function calendarMonths() {
  const names = [];
  for (let index = 0; index < 12; index += 1) {
    const date = new Date(Date.UTC(2026, index, 1));
    names.push(date.toLocaleString('en-US', { month: 'long', timeZone: 'UTC' }));
    names.push(date.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' }));
  }
  return [...new Set(names)].sort((left, right) => right.length - left.length);
}

function monthPattern() {
  return calendarMonths().map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
}

function pushError(errors, line) {
  if (line && !errors.includes(line)) errors.push(line);
}

function rangeEndRe() {
  const month = monthPattern();
  const weekday = 'sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sunday|monday|tuesday|wednesday|thursday|friday|saturday';
  return new RegExp(`\\b(?:(?:${weekday})\\s+)?(?:${month})\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?\\s*(?:[\\u2013\\-]|to|through)\\s*(?:the\\s+)?(?:(?:${weekday})\\s+)?(?:(?:${month})\\.?\\s+)?(\\d{1,2})(?:st|nd|rd|th)?`, 'gi');
}
const DEPARTURE = /\blast day\b|\blast evening\b|\blast morning\b|\bpack(?:ing)? up\b|\bpacked and\b|\bpack(?:ing|ed)?\b(?!\s+schedule)(?!\s+(?:a |the )?(?:cooler|water|snack|snacks|lunch|towel|bag))|\bafter checkout\b|\bone last time\b/i;

export function draftFactErrors(reply, facts = {}) {
  const body = String(reply || '');
  const errors = [];
  const span = facts.span || null;
  if (!facts.planOwned && /you(?:'|’)re all set (?:with|for) the\b[^.]{0,80}unlimited|you are all set (?:with|for) the\b[^.]{0,80}unlimited|already (?:own|have|set up)[^.]{0,40}unlimited/i.test(body)) {
    pushError(errors, 'the unlimited plan is not owned yet');
  }
  const endDay = endDayNumber(span);
  const ranges = body.matchAll(rangeEndRe());
  for (const shortened of ranges) {
    if (endDay && Number(shortened[1]) !== endDay) {
      pushError(errors, `the trip runs through ${facts.span?.endLabel || span.end}, not day ${shortened[1]}`);
    }
  }
  if (/no extra charge|no extra cost|at no extra/i.test(body)) {
    pushError(errors, 'no extra charge is not in what the customer set');
  }
  if (/\b(?:we|i)(?:'|’)ve corrected\b|\b(?:we|i) have corrected\b/i.test(body)) {
    pushError(errors, 'the reply invented a correction');
  }
  const ownerName = String(facts.ownerName || '').trim();
  const ownerFirst = ownerName.split(/\s+/)[0] || '';
  if (ownerFirst) {
    const ownerRe = new RegExp(`\\b${ownerFirst}\\b`, 'i');
    if (!ownerRe.test(body) && /\bjust the crew\b|\bfull party\b|\bwhole crew\b/i.test(body)) {
      pushError(errors, `${ownerName} is traveling`);
    }
  }
  const paragraphs = body.split(/\n{2,}/).map((part) => part.replace(/\s+/g, ' ').trim().toLowerCase()).filter((part) => part.length > 40);
  const repeatedSentences = splitSentences(body).map((part) => part.replace(/\s+/g, ' ').trim().toLowerCase()).filter((part) => part.length > 40);
  if (new Set(paragraphs).size !== paragraphs.length || new Set(repeatedSentences).size !== repeatedSentences.length) {
    pushError(errors, 'a paragraph is repeated');
  }
  const sentences = splitSentences(body);
  const tripEnd = endWeekday(span);
  const endStamp = span?.end ? dayStamp(`${MONTH_ABBR[Number(String(span.end).slice(5, 7))]} ${endDay}`) : '';
  for (let index = 0; index < sentences.length; index += 1) {
    const sentence = sentences[index];
    const partyCount = sentence.match(/\bparty of (\d+)\b/i);
    if (partyCount) {
      const claimed = Number(partyCount[1]);
      const savedCount = (facts.travelers || []).filter(Boolean).length;
      if (savedCount && claimed !== savedCount) pushError(errors, `saved party size is ${savedCount}`);
    }
    if (ownerFirst && /\baccount holder\b/i.test(sentence) && facts.addressedTo && facts.addressedTo.toLowerCase() !== ownerFirst.toLowerCase()) {
      pushError(errors, `the account holder is ${ownerName}`);
    }
    const travelerFirst = [...new Set((facts.travelers || []).map((name) => String(name || '').split(/\s+/)[0]).filter((name) => name.length > 2))];
    if (travelerFirst.length >= 3) {
      const mentioned = travelerFirst.filter((name) => new RegExp(`\\b${name}\\b`, 'i').test(body));
      if (mentioned.length >= Math.min(5, travelerFirst.length - 1) && mentioned.length < travelerFirst.length) {
        for (const name of travelerFirst) {
          if (!mentioned.some((item) => item.toLowerCase() === name.toLowerCase())) pushError(errors, `${name} is traveling`);
        }
      }
    }
    for (const person of facts.notTraveling || []) {
      const named = new RegExp(`\\b${String(person.name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      const absent = /\bnot (?:on the trip|traveling|with the crew|in the house)\b|\b(?:aren(?:'|’)t|are not) traveling\b|\bviewer\b|\beditor\b|\bview access\b|\bedit access\b/i.test(sentence);
      if (!absent && named.test(sentence) && /\bon the trip|all together|sharing the|whole group|for your stay|with the crew|all on the trip|in the house|with you|joining you|coming along|along with/i.test(sentence)) {
        pushError(errors, `${person.name} is a ${person.role}, not on the trip`);
      }
    }
    if (DEPARTURE.test(sentence)) {
      const stamps = looseDayStamps(sentence, span);
      const named = weekdayName(sentence);
      const onEnd = (stamps.length && endStamp && stamps.includes(endStamp)) || (named && tripEnd && named === tripEnd && (!stamps.length || stamps.includes(endStamp)));
      if (!onEnd) {
        pushError(errors, `${stamps[0] || named || 'that phrase'} is not the trip end`);
      }
    }
  }
  return errors;
}

export function draftAccuracyErrors(reply, context = {}) {
  const facts = context.facts || customerTripFacts(context.priorTurns || [], context.customerTurn || '');
  return draftFactErrors(reply, facts);
}

export function applyAccuracyRewrite(quality, errors) {
  const list = (Array.isArray(errors) ? errors : []).map((error) => String(error || '').trim()).filter(Boolean);
  if (!list.length) return quality;
  return {
    ...quality,
    accuracyErrors: list,
    factCheck: list,
    hardFlag: true,
    wantsRewrite: true,
  };
}

function rememberRoster(sources, field, value, source) {
  sources.push({ field, value, source });
}

export function completeRosterParty(doc) {
  const stored = doc?.party && typeof doc.party === 'object' ? doc.party : {};
  const sources = [];
  const party = {
    primary: null,
    collaborators: [],
    preference_subjects: [],
    viewers: [],
    editors: [],
    sources,
  };
  if (stored.primary?.name) {
    party.primary = { name: stored.primary.name, role: stored.primary.role || 'Owner' };
    rememberRoster(sources, 'primary', party.primary.name, 'trip.dialogParty');
  } else if (doc?.customerName || doc?.targetPerson) {
    party.primary = { name: doc.customerName || doc.targetPerson, role: 'Owner' };
    rememberRoster(sources, 'primary', party.primary.name, 'session');
  }
  for (const person of Array.isArray(stored.collaborators) ? stored.collaborators : []) {
    if (!person?.name) continue;
    party.collaborators.push({ ...person });
    rememberRoster(sources, `collaborators.${person.name}`, person.payer || '', 'trip.dialogParty');
  }
  for (const kid of Array.isArray(stored.preference_subjects) ? stored.preference_subjects : []) {
    if (!kid?.name || !Number.isFinite(Number(kid.age))) continue;
    party.preference_subjects.push({ name: kid.name, age: Number(kid.age) });
    rememberRoster(sources, `preference_subjects.${kid.name}`, Number(kid.age), 'trip.dialogParty');
  }
  for (const person of Array.isArray(stored.viewers) ? stored.viewers : []) {
    if (!person?.name) continue;
    party.viewers.push({ name: person.name });
    rememberRoster(sources, `viewers.${person.name}`, 'viewer', 'trip.dialogParty');
  }
  for (const person of Array.isArray(stored.editors) ? stored.editors : []) {
    if (!person?.name) continue;
    party.editors.push({ name: person.name });
    rememberRoster(sources, `editors.${person.name}`, 'editor', 'trip.dialogParty');
  }
  const samePerson = (left, right) => new RegExp(`^${String(left || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(String(right || ''));
  let unplaced = false;
  for (const person of Array.isArray(doc?.roster) ? doc.roster : []) {
    const name = String(person?.name || '').trim();
    const role = String(person?.role || '').trim().toLowerCase();
    if (!name) continue;
    if (role === 'owner') {
      if (!party.primary?.name) {
        party.primary = { name, role: 'Owner' };
        rememberRoster(sources, 'primary', name, 'chat_extraction');
      }
    } else if (role === 'child') {
      const age = person.age === null || person.age === undefined || person.age === '' ? NaN : Number(person.age);
      if (!Number.isFinite(age)) {
        unplaced = true;
        continue;
      }
      if (party.preference_subjects.some((kid) => samePerson(name, kid.name))) continue;
      party.preference_subjects.push({ name, age });
      rememberRoster(sources, `preference_subjects.${name}`, age, 'chat_extraction');
    } else if (role === 'viewer') {
      if (party.viewers.some((item) => samePerson(name, item.name))) continue;
      party.viewers.push({ name });
      rememberRoster(sources, `viewers.${name}`, 'viewer', 'chat_extraction');
    } else if (role === 'editor') {
      if (party.editors.some((item) => samePerson(name, item.name))) continue;
      party.editors.push({ name });
      rememberRoster(sources, `editors.${name}`, 'editor', 'chat_extraction');
    } else if (role === 'collaborator') {
      if (party.primary?.name && samePerson(name, party.primary.name)) continue;
      if (party.collaborators.some((item) => samePerson(name, item.name))) continue;
      const payer = String(person?.payer || '').trim();
      party.collaborators.push({ name, payer });
      rememberRoster(sources, `collaborators.${name}`, payer, 'chat_extraction');
    } else {
      unplaced = true;
    }
  }
  if (doc?.rosterError) {
    party.rosterError = String(doc.rosterError);
    party.askRoster = true;
  } else if (doc?.askRoster === true || unplaced) {
    party.askRoster = true;
  }
  return party;
}

function rewriteAttempted(turn) {
  return turn?.quality?.rewritten === true
    || turn?.flagged === true
    || Boolean(String(turn?.rewriteModel || '').trim())
    || Boolean(String(turn?.rewriteText || '').trim());
}

function readInterimJudge(result) {
  if (!result || result.judged !== true || typeof result.template !== 'boolean') return null;
  return { judged: true, template: result.template === true, canShip: result.canShip === true && result.template !== true };
}

function interimJudgeError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

export async function judgeInterimReply({ text, customerTurn, facts = {}, env = process.env, judge = null, fetchImpl = null } = {}) {
  const value = String(text || '').trim();
  if (!value) return { judged: true, template: true, canShip: false, reason: 'empty' };
  if (typeof judge === 'function') {
    const verdict = await judge({ text: value, customerTurn, facts });
    const parsed = readInterimJudge(verdict?.judged === true ? verdict : { ...verdict, judged: true });
    if (!parsed) throw interimJudgeError('INTERIM_JUDGE_UNUSABLE');
    return { ...parsed, reason: '' };
  }
  const key = String(env?.TIMESYNCHER_JEV_CLASSIFY_TOKEN || env?.TIMESYNCHER_OPENROUTER_API_KEY || env?.OPENROUTER_API_KEY || '').trim();
  if (!key) throw interimJudgeError('INTERIM_JUDGE_CREDENTIALS_MISSING');
  const response = await (fetchImpl || fetch)('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      model: INTERIM_MODEL,
      temperature: 0,
      max_tokens: 80,
      messages: [
        { role: 'system', content: 'Return only JSON {"template":boolean,"canShip":boolean}. template means a stock acknowledgement or a reply that misses the customer. canShip means it answers this turn. Do not write a reply.' },
        { role: 'user', content: JSON.stringify({ customer: String(customerTurn || '').slice(0, 4000), reply: value.slice(0, 2000) }) },
      ],
    }),
    signal: AbortSignal.timeout(8000),
  });
  const body = typeof response?.json === 'function' ? await response.json().catch(() => ({})) : {};
  if (!response?.ok) throw interimJudgeError('INTERIM_JUDGE_HTTP');
  let parsed = null;
  try {
    const raw = String(body?.choices?.[0]?.message?.content || '');
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    const json = start >= 0 && end > start ? JSON.parse(raw.slice(start, end + 1)) : null;
    parsed = readInterimJudge(json && typeof json.template === 'boolean' && typeof json.canShip === 'boolean' ? { ...json, judged: true } : null);
  } catch {
    parsed = null;
  }
  if (!parsed) throw interimJudgeError('INTERIM_JUDGE_UNUSABLE');
  return { ...parsed, reason: '' };
}

export function isTemplateInterim(text, _customerTurn, judgeResult) {
  const value = String(text || '').trim();
  if (!value) return true;
  const verdict = readInterimJudge(judgeResult);
  if (!verdict) return true;
  return verdict.template;
}

export function interimProblems(turns) {
  const problems = [];
  const seen = new Map();
  const list = Array.isArray(turns) ? turns : [];
  for (const turn of list) {
    if (turn?.role && turn.role !== 'app') continue;
    const interim = turn?.interimReply;
    const text = String(interim?.text || '').trim();
    const rewritten = rewriteAttempted(turn);
    const prior = list.slice(0, list.indexOf(turn)).reverse().find((item) => item?.role === 'customer');
    const template = isTemplateInterim(text, prior?.text || '', interim?.judge);
    if (rewritten) {
      if (!text || template) problems.push(`turn ${turn.turnIndex} rewrite is missing an interim reply`);
      else if (interim?.model !== 'google/gemini-2.5-flash-lite') {
        problems.push(`turn ${turn.turnIndex} interim model is not google/gemini-2.5-flash-lite`);
      }
    } else if (text) {
      problems.push(`turn ${turn.turnIndex} non-rewrite turn has an interim reply`);
      if (template) problems.push(`turn ${turn.turnIndex} interim reply is a template`);
    }
    if (!text) continue;
    const key = text.toLowerCase().replace(/\s+/g, ' ');
    if (seen.has(key)) problems.push(`interim reply repeats across turns ${seen.get(key)} and ${turn.turnIndex}`);
    else seen.set(key, turn.turnIndex);
  }
  return problems;
}

export function nearIdenticalRewrite(draft, rewritten) {
  if (!rewriteReplacesDraft(draft, rewritten)) return true;
  const a = String(draft || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const b = String(rewritten || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  if (!a || !b || b.includes(a) || a.includes(b)) return true;
  return bigramDice(a, b) >= 0.88;
}

function bigramDice(a, b) {
  if (a.length < 2 || b.length < 2) return a === b ? 1 : 0;
  const grams = (value) => {
    const map = new Map();
    for (let index = 0; index < value.length - 1; index += 1) {
      const gram = value.slice(index, index + 2);
      map.set(gram, (map.get(gram) || 0) + 1);
    }
    return map;
  };
  const left = grams(a);
  const right = grams(b);
  let shared = 0;
  for (const [gram, count] of left) shared += Math.min(count, right.get(gram) || 0);
  const total = [...left.values(), ...right.values()].reduce((sum, count) => sum + count, 0);
  return total ? (2 * shared) / total : 0;
}

export function shipChoice({
  draft,
  rewrite,
  draftScore = null,
  rewriteScore = null,
  draftFactErrors = [],
  rewriteFactErrors = [],
  holding = '',
  holdingFactErrors = [],
  holdingScore = null,
}) {
  const rewriteText = String(rewrite || '').trim();
  const draftCount = (Array.isArray(draftFactErrors) ? draftFactErrors : []).length;
  const rewriteCount = (Array.isArray(rewriteFactErrors) ? rewriteFactErrors : []).length;
  const rewriteOk = rewriteReplacesDraft(draft, rewriteText) && rewriteCount === 0;
  const draftRaw = Number(draftScore);
  const rewriteRaw = Number(rewriteScore);
  const hold = String(holding || '').trim();
  const holdErrors = (Array.isArray(holdingFactErrors) ? holdingFactErrors : []).map((error) => String(error || '').trim()).filter(Boolean);
  const holdClean = draftCount > 0 && Boolean(hold) && holdErrors.length === 0;
  const holdingRaw = Number(holdingScore);
  const baseline = holdClean && Number.isFinite(holdingRaw) ? holdingRaw : draftRaw;
  const SCORE_NOISE = 0.15;
  const scoredLower = !Number.isFinite(rewriteRaw) || !Number.isFinite(baseline) || rewriteRaw < baseline - SCORE_NOISE;
  if (rewriteOk && !scoredLower) {
    return { text: String(rewrite).trim(), rewritten: true, flagged: false, held: false, failReason: '', holding: false };
  }
  let failReason = '';
  if (rewriteCount > 0) failReason = 'rewrite_fact_check_held';
  else if (scoredLower && rewriteOk) failReason = 'rewrite_scored_lower';
  else if (!rewriteOk) failReason = 'rewrite_not_shipped';
  if (draftCount > 0) {
    if (hold && holdErrors.length === 0) {
      return { text: hold, rewritten: false, flagged: false, held: true, failReason: failReason || 'holding_reply', holding: true };
    }
    if (rewriteOk) {
      return { text: String(rewrite).trim(), rewritten: true, flagged: false, held: false, failReason: '', holding: false };
    }
    return { text: '', rewritten: false, flagged: true, held: true, failReason: failReason || 'draft_held', holding: false };
  }
  return {
    text: draft,
    rewritten: false,
    flagged: false,
    held: false,
    failReason,
    holding: false,
  };
}

export function holdingShipErrors(text, facts = {}) {
  const errors = draftFactErrors(text, { ...facts, strictSaved: true });
  const who = String(facts.addressedTo || '').trim().split(/\s+/)[0];
  const vocative = String(text || '').match(/(?:^|[.!?]\s+)([A-Z][a-z]{2,}),\s/);
  if (who && vocative && vocative[1].toLowerCase() !== who.toLowerCase()) {
    pushError(errors, `addresses ${vocative[1]} while ${who} is speaking`);
  }
  return errors;
}

export function interimCanShip(text, customerTurn, facts = {}, judgeResult) {
  const value = String(text || '').trim();
  const verdict = readInterimJudge(judgeResult);
  if (!value || !verdict || isTemplateInterim(value, customerTurn, verdict) || !verdict.canShip) return false;
  if (holdingShipErrors(value, facts).some((error) => /claimed as saved|account holder is|not on the trip|while .+ is speaking|invented a correction/.test(error))) return false;
  if (turnMarkedIntake(customerTurn) && !/\bcollaborat/i.test(value)) return false;
  return true;
}

const BEAT_STOP = new Set(['with', 'that', 'this', 'from', 'into', 'your', 'days', 'day', 'the', 'and', 'for']);

export function beatsMatchingReply(beats, text) {
  const body = String(text || '');
  const lower = body.toLowerCase();
  const matched = [];
  for (const beat of Array.isArray(beats) ? beats : []) {
    const line = String(beat || '').replace(/\s+/g, ' ').trim();
    if (!line) continue;
    const beatLower = line.toLowerCase();
    if (/\bbackup\b|\brain\b/.test(beatLower) && !/\bbackup\b|\brain|\bshift/.test(lower)) continue;
    if (/\boffer/.test(beatLower) && !/\bor\b|\boption\b/.test(lower)) continue;
    const words = beatLower.split(/[^a-z0-9]+/).filter((word) => word.length > 3 && !BEAT_STOP.has(word));
    if (words.length) {
      const hit = words.filter((word) => lower.includes(word)).length;
      if (hit / words.length < 0.5) continue;
    }
    matched.push(line);
  }
  return matched;
}

export function formatQualityLine(quality) {
  if (!quality || quality.judged !== true) return '';
  const score = Number(quality.score);
  if (!Number.isFinite(score) || score < 1 || score > 5) return '';
  const shown = Number.isInteger(score) ? String(score) : String(Math.round(score * 1000) / 1000);
  return `quality: ${shown}`;
}

export function heldRewriteLine(turn) {
  if (!turn || turn.held !== true || turn.quality?.rewritten === true) return '';
  const drafted = String(turn.rewriteText || '').trim()
    || (Array.isArray(turn.rewriteAttempts) && turn.rewriteAttempts.some((item) => String(item?.text || '').trim()));
  if (!drafted) return '';
  const reason = String(turn.rewriteFailReason || '').replace(/\s+/g, ' ').trim() || 'held';
  return `rewrite drafted, held: ${reason}`;
}

const REWRITE_STOP = new Set(['the', 'a', 'an', 'and', 'or', 'to', 'of', 'for', 'in', 'on', 'at', 'is', 'are', 'was', 'were', 'be', 'this', 'that', 'it', 'you', 'your', 'we', 'our', 'with', 'from', 'as', 'if', 'so', 'not', 'do', 'does', 'what', 'when', 'where', 'who', 'how']);

function rewriteTokens(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((word) => word.length > 2 && !REWRITE_STOP.has(word));
}

export function rewriteKeepsSubstance(draft, rewritten) {
  const need = rewriteTokens(draft);
  if (!need.length) return true;
  const have = new Set(rewriteTokens(rewritten));
  const hit = need.filter((word) => have.has(word)).length;
  if (hit / need.length < 0.55) return false;
  const days = String(draft || '').match(/\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/gi) || [];
  return days.every((day) => new RegExp(`\\b${day}\\b`, 'i').test(String(rewritten || '')));
}

export function rewriteAnswersQuestion(customerTurn, rewritten, intent) {
  const body = String(rewritten || '');
  if (customerAsksPrice(customerTurn, intent)) return priceAnswered(body, { text: customerTurn, seats: intent?.seats });
  if (customerAsksAccessChoice(customerTurn, intent)) return /\bview access\b/i.test(body) && /\bedit access\b/i.test(body);
  const question = splitSentences(customerTurn).find((sentence) => /\?/.test(sentence));
  if (!question) return true;
  const words = rewriteTokens(question);
  if (!words.length) return true;
  const have = new Set(rewriteTokens(body));
  return words.some((word) => have.has(word));
}

export function rewriteReplacesDraft(draft, rewritten) {
  const prior = String(draft || '').replace(/\s+/g, ' ').trim();
  const next = String(rewritten || '').replace(/\s+/g, ' ').trim();
  if (!next || next === prior) return false;
  if (next.startsWith(prior) || prior.startsWith(next)) return false;
  if (next.includes(prior)) return false;
  if (STOCK_REWRITE_LEAD.test(next)) return false;
  return true;
}

export function hardQualityFlags(reply, customerTurn, corpus, sources, intent) {
  const body = String(reply || '');
  const ask = customerTurnText(customerTurn);
  const intentArg = (intent && typeof intent === 'object')
    ? intent
    : (sources && !Array.isArray(sources) && typeof sources === 'object' ? sources : null);
  const placeSources = Array.isArray(sources) ? sources : (Array.isArray(corpus) ? corpus : []);
  return {
    split: item34BanHit(body),
    invented: unsourcedPlaces(body, placeSources),
    missingPrice: customerAsksPrice(ask, intentArg) && !priceAnswered(body, { text: ask, seats: intentArg?.seats }),
    missingAccess: customerAsksAccessChoice(ask, intentArg) && !(/\bview access\b/i.test(body) && /\bedit access\b/i.test(body)),
    missingCollaborators: turnMarkedIntake(customerTurn) && !/\bcollaborat/i.test(body),
  };
}

export function correctFalsePriceMiss(quality, reply, customerTurn, intent) {
  if (!customerAsksPrice(customerTurn, intent) || priceAnswered(reply, { text: customerTurn, seats: intent?.seats })) return quality;
  return {
    ...quality,
    score: Math.min(Number(quality?.score) || 1, 3),
    wantsRewrite: true,
  };
}

export function dockQuality(quality, flags) {
  const rule = Boolean(flags?.invented?.length || flags?.split || flags?.missingPrice || flags?.missingAccess || flags?.missingCollaborators);
  const score = rule ? Math.min(Number(quality?.score) || 1, 3) : Number(quality?.score);
  return {
    ...quality,
    score,
    hardFlag: rule,
    wantsRewrite: quality?.wantsRewrite === true || score <= 2 || rule,
  };
}

function applyUpsellPolicy(reply) {
  return stripChatMarkdown(String(reply || '').trim());
}

function rewriteBreaksUpsell(text, upsell, customerTurn, intent) {
  if (upsell !== 'forbidden') return false;
  if (isCollabWelcome(text)) return true;
  if (customerAsksPrice(customerTurn, intent)) return false;
  return isFullUpsell(text) || UNLIMITED_PATTERN.test(text);
}

function item34Reason(text) {
  return item34BanHit(text) ? 'item34_ban' : '';
}

function cleanCandidate(text) {
  return applyUpsellPolicy(text);
}

async function loadSavedTripRecord(session, env = process.env) {
  const tripId = session?.trip_id || session?.tripId;
  if (!tripId || !env?.DATABASE_URL) return null;
  try {
    const { sql } = await import('./db.mjs');
    const db = sql(env);
    const trips = await db`select destination, start_date, end_date, metadata from trips where id = ${tripId} limit 1`;
    const row = trips[0];
    if (!row) return null;
    const meta = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
    const thingRows = await db`select title, category, metadata from trip_things where trip_id = ${tripId} order by created_at asc`;
    return {
      start: row.start_date || '',
      end: row.end_date || '',
      destination: String(row.destination || '').trim(),
      things: thingRows.map((thing) => {
        const thingMeta = thing.metadata && typeof thing.metadata === 'object' ? thing.metadata : {};
        const sourceRef = thingMeta.sourceRef && typeof thingMeta.sourceRef === 'object' ? thingMeta.sourceRef : null;
        return {
          title: thing.title,
          category: thing.category || thingMeta.category || '',
          who: thingMeta.who || '',
          whenLabel: thingMeta.whenLabel || '',
          customerWhen: thingMeta.customerWhen || '',
          notes: thingMeta.notes || [],
          ...(sourceRef ? { sourceRef } : {}),
        };
      }),
      party: meta.dialogParty && typeof meta.dialogParty === 'object' ? meta.dialogParty : null,
      rule: meta.intakeRule || '',
      planOwned: meta.planOwned === true || meta.unlimitedPlanOwned === true,
    };
  } catch {
    return null;
  }
}

function joiningSeatRecord(session) {
  const seat = session?.metadata?.seat || session?.seat;
  const name = String(seat?.displayName || seat?.name || '').trim();
  return name ? { name, payer: String(seat?.payer || '').trim() } : null;
}

function mergeSavedTurn(saved, priorTurns, customerTurn, session, extraction = {}) {
  const projected = projectCustomerRecord(priorTurns, customerTurn);
  const span = saved?.start ? spanFromIso(saved.start, saved.end || saved.start) : projected.span;
  const baseThings = Array.isArray(saved?.things) && saved.things.length ? saved.things : projected.things;
  const noted = customerTurn ? applyCustomerNotes(baseThings, customerTurn) : baseThings;
  const things = applyAgreedAppSwim(noted, customerTurn, '', span);
  const seat = session?.metadata?.seat || session?.seat;
  const collaborator = seat?.role === 'collaborator' || Boolean(seat?.ownerCustomerId);
  const storedOwner = String(saved?.party?.primary?.name || '').trim();
  const holder = storedOwner || (collaborator ? '' : String(session?.display_name || session?.displayName || '').trim());
  const rosterKnown = Array.isArray(extraction.roster) || Boolean(extraction.rosterError);
  const party = completeRosterParty({
    party: {
      ...(saved?.party || {}),
      primary: holder ? { name: holder, role: 'Owner' } : (saved?.party?.primary || null),
    },
    customerName: holder,
    turns: [{ role: 'customer', text: customerCorpus(priorTurns, customerTurn) }],
    ...(rosterKnown ? {
      roster: Array.isArray(extraction.roster) ? extraction.roster : [],
      rosterError: extraction.rosterError || null,
      askRoster: extraction.askRoster === true,
    } : {}),
  });
  return {
    destination: String(saved?.destination || '').trim(),
    start: span?.start || projected.start || '',
    end: span?.end || projected.end || '',
    span,
    things,
    party,
    planOwned: saved?.planOwned === true,
    rule: saved?.rule || projected.rule,
    addressedTo: projected.addressedTo || (collaborator ? String(seat?.displayName || '').trim().split(/\s+/)[0] : ''),
    ...customerInputFields(saved),
  };
}

export async function produceLiveAppReply({ customerTurn, session, priorTurns, tripTitle, placeResults = [], env = process.env, seatDollars: suppliedSeatDollars = null, intake = false, wantedThings = [], roster = null, rosterError = null, extractedDestination = '', extractedTitle = '', destinationError = null, titleError = null } = {}) {
  const rules = await loadVacationAppReplyRules(env);
  const history = Array.isArray(priorTurns) ? priorTurns : [];
  const memory = memoryTurns(history);
  const intakeTurn = { text: customerTurn, intake: intake === true };
  const postIntake = firstMarkedIntake(intakeTurn, history);
  if (postIntake) {
    return produceFirstIntakeReply({
      customerTurn,
      session,
      tripTitle,
      env,
      rules,
      wantedThings,
      roster,
      extractedDestination,
    });
  }
  let intent = emptyIntent();
  try {
    intent = await customerIntent(customerTurn, { env });
  } catch (error) {
    intent = { ...emptyIntent(), error: String(error?.message || error) };
  }
  const upsell = upsellModeForTurn(intakeTurn, history, intent);
  const corpus = [customerTurn, ...history.filter((turn) => turn?.role === 'customer').map((turn) => turn.text)].join('\n');
  const savedTrip = await loadSavedTripRecord(session, env);
  const citedPlaces = [...savedThingPlaceResults(savedTrip), ...(Array.isArray(placeResults) ? placeResults : [])];
  const rosterList = Array.isArray(roster) ? roster : [];
  const mergedTrip = mergeSavedTurn(savedTrip, history, customerTurn, session, {
    roster: Array.isArray(roster) ? roster : null,
    rosterError: rosterError || null,
    askRoster: Boolean(rosterError) || (intake === true && Array.isArray(roster) && rosterList.length === 0),
  });
  const tripContext = draftingFacts(history, customerTurn, mergedTrip);
  if (mergedTrip?.rule) tripContext.rule = String(mergedTrip.rule);
  const seat = joiningSeatRecord(session);
  const tripFacts = savedTripFacts(mergedTrip);
  tripFacts.customerTurn = String(customerTurn || '');
  const seatDollars = Number(suppliedSeatDollars);
  const pricedSeat = Number.isFinite(seatDollars) && seatDollars > 0 ? seatDollars : null;
  tripFacts.seatDollars = pricedSeat;
  tripFacts.payerRows = (Array.isArray(mergedTrip.party?.collaborators) ? mergedTrip.party.collaborators : [])
    .map((person) => ({ name: String(person?.name || '').trim(), payer: String(person?.payer || '').trim() }))
    .filter((row) => row.name && row.payer);
  const extractedSeats = Array.isArray(intent?.seats) && intent.seats.some((seat) => seat?.name && seat?.payer)
    ? intent.seats
    : tripFacts.payerRows;
  const planLine = customerAsksPrice(customerTurn, intent) && pricedSeat
    ? payerLineFromDollars(customerTurn, pricedSeat, extractedSeats)
    : '';
  const planTable = planLine
    ? {
      dollars_per_collaborator_seat: pricedSeat,
      payer_line: planLine,
    }
    : null;
  const jevStarted = Date.now();
  const jev = await jevPrecall({
    customerTurn,
    stage: 'vacation_conversation',
    screen: 'vacation-app',
    session: { seed_id: session?.token || null },
    env,
  });
  if (jev && typeof jev === 'object') jev.jevLatencyMs = Math.max(0, Date.now() - jevStarted);
  if (!rules?.ok) {
    return {
      reply: null,
      rules,
      jev,
      model: null,
      reason: rules?.error || 'reply_rules_unloaded',
    };
  }
  if (!jev?.jevRan) {
    return {
      reply: null,
      rules,
      jev,
      model: null,
      jevLatencyMs: jev?.jevLatencyMs ?? null,
      genLatencyMs: null,
      jevBeforeModel: false,
      reason: jev?.error || 'jev_skipped',
    };
  }
  jev.jevBeforeModel = true;
  const resolvedDestination = await resolveTripDestination({
    saved: savedTrip?.destination || '',
    texts: [String(extractedDestination || '').trim()],
    complete: async () => String(extractedDestination || '').trim() || 'none',
  });
  const destination = resolvedDestination.destination;
  const genStarted = Date.now();
  const speaker = String(tripFacts.addressedTo || '').trim();
  const draftExtra = [
    tripContext.roster || '',
    'When you list who is coming, name every traveler in the saved roster. Do not add a name that is not in that roster.',
    speaker ? `The person speaking now is ${speaker}. Address ${speaker}. Do not address ${tripFacts.ownerName || 'the account holder'} as if they sent this message.` : '',
    placeResultExtra(citedPlaces),
    resolvedDestination.ask ? DESTINATION_ASK : '',
  ].filter(Boolean).join(' ');
  const modelArgs = (turnText, mode) => ({
    rules,
    jev,
    customerTurn: turnText,
    stage: 'vacation_conversation',
    screen: 'vacation-app',
    destination,
    memory,
    upsell: mode,
    postIntake,
    env,
    tripContext,
    planTable,
    planLine,
    seatDollars,
    seat,
    planOwned: mergedTrip.planOwned === true,
    systemExtra: draftExtra,
  });
  let model = await callTieredModel(modelArgs(customerTurn, upsell));
  let reply = applyUpsellPolicy(model?.called && model.text ? String(model.text) : '', upsell, postIntake, customerTurn);
  for (let attempt = 0; attempt < 2 && !String(reply || '').trim(); attempt += 1) {
    model = await callTieredModel(modelArgs(`${customerTurn}\n\nWrite the reply in sentences. Do not return an empty message.`, upsell));
    reply = applyUpsellPolicy(model?.called && model.text ? String(model.text) : '', upsell, postIntake, customerTurn);
  }
  if (rewriteBreaksUpsell(reply, upsell, customerTurn, intent)) {
    const nudge = customerAsksPrice(customerTurn, intent)
      ? `${customerTurn}\n\nAnswer with who pays: ${planLine || 'the dollar amount for each person and who pays'}. Do not add a second collaborator welcome.`
      : `${customerTurn}\n\nDo not welcome collaborators. Do not mention price or access. Answer the day only.`;
    model = await callTieredModel(modelArgs(nudge, 'forbidden'));
    reply = applyUpsellPolicy(model?.called && model.text ? String(model.text) : '', upsell, postIntake, customerTurn);
  }
  if (model && typeof model === 'object') model.genLatencyMs = Math.max(0, Date.now() - genStarted);
  const banned = appTextBanned(reply);
  if (!reply || banned) {
    return {
      reply: null,
      rules,
      jev,
      model,
      reason: banned || model?.reason || 'live dispatcher returned no reply',
    };
  }
  const originalDraft = reply;
  const draftModel = String(model?.responseModel || '').trim();
  const draftLatencyMs = Number(model?.genLatencyMs) || Math.max(0, Date.now() - genStarted);
  const draftFlags = hardQualityFlags(originalDraft, intakeTurn, corpus, citedPlaces, intent);
  const qualityStarted = Date.now();
  let quality = await jevQualityRewrite({ customerTurn, draft: originalDraft, tripContext, planLine, env });
  if (!quality?.judged) quality = await jevQualityRewrite({ customerTurn, draft: originalDraft, tripContext, planLine, env });
  const draftQualityMs = Math.max(0, Date.now() - qualityStarted);
  const factErrors = draftFactErrors(originalDraft, tripFacts);
  if (quality?.judged) {
    quality = correctFalsePriceMiss(dockQuality(quality, draftFlags), originalDraft, customerTurn, intent);
    quality = applyAccuracyRewrite(quality, factErrors);
    quality.jevNote = null;
    quality.comment = null;
    quality.jevNoteReason = 'jev_no_free_text';
    quality.judgeMs = draftQualityMs;
  }
  const jevNote = null;
  const draftFactLine = factErrors.length ? factErrors.join('; ') : 'ok';
  const savedTripLog = {
    start: tripFacts.span?.start || '',
    end: tripFacts.span?.end || '',
    owner: tripFacts.ownerName || '',
  };
  const baseLog = {
    draftModel,
    rewriteModel: null,
    shippedModel: draftModel,
    jevScoreDraft: quality.score,
    jevScoreRaw: rawScore(quality.scoreRaw),
    jevDisposition: quality.disposition || null,
    jevFixFocus: quality.jevFocus || null,
    draftJevScoreRaw: rawScore(quality.scoreRaw),
    draftJevDisposition: quality.disposition || null,
    draftJevFixFocus: quality.jevFocus || null,
    rewriteJevScoreRaw: null,
    rewriteJevDisposition: null,
    rewriteJevFixFocus: null,
    draftFactCheck: draftFactLine,
    rewriteFactCheck: null,
    rejudgeMs: null,
    rawModelText: model?.text == null ? null : String(model.text),
    jevScoreRewrite: null,
    jevNote,
    jevNoteReason: 'jev_no_free_text',
    rewriterChange: null,
    savedTrip: savedTripLog,
    interimReply: { text: null, model: null, ms: null },
    latencyMs: { draft: draftLatencyMs, rewrite: null, jevDraft: draftQualityMs, jevRewrite: null, total: draftLatencyMs + draftQualityMs },
    flagged: false,
  };
  if (!quality?.judged) {
    return {
      reply: originalDraft,
      rules,
      jev,
      model: {
        ...(model || {}),
        quality: quality || { judged: false },
        log: { ...baseLog, draftText: originalDraft, flagged: false, rewriteFailReason: quality?.reason || 'quality_not_judged' },
      },
      quality: quality || { judged: false },
      log: { ...baseLog, draftText: originalDraft, flagged: false, rewriteFailReason: quality?.reason || 'quality_not_judged' },
      reason: quality?.reason || 'quality_not_judged',
    };
  }
  const needsRewrite = mustRewriteQuality(quality);
  if (!needsRewrite) {
    const shipped = stampShippedReply({
      reply: originalDraft,
      quality,
      draftModel,
      log: { ...baseLog, draftText: originalDraft, flagged: false },
      draft: originalDraft,
    });
    shipped.model.modelTier = model?.modelTier ?? jev?.modelTier ?? null;
    shipped.model.beats = model?.beats || null;
    shipped.model.via = model?.via || shipped.model.via;
    return { reply: shipped.reply, rules, jev, model: shipped.model, quality: shipped.quality, log: shipped.log, reason: null };
  }
  const interimStarted = Date.now();
  const interimPromise = interimFromTierOne({ rules, customerTurn, destination, env, facts: tripFacts, seat, intake: intake === true, intent }).then((interim) => {
    interim.ms = String(interim.text || '').trim() ? Math.max(Number(interim.ms) || 0, Date.now() - interimStarted) : null;
    return interim;
  });
  const pending = {
    customerTurn,
    draft: originalDraft,
    draftModel,
    draftScore: quality.score,
    jevNote,
    quality,
    jev,
    upsell,
    postIntake,
    intake: intake === true,
    wantedThings: Array.isArray(wantedThings) ? wantedThings : [],
    roster: rosterList,
    rosterError: rosterError || null,
    extractedDestination: String(extractedDestination || ''),
    extractedTitle: String(extractedTitle || ''),
    destinationError: destinationError || null,
    titleError: titleError || null,
    destination,
    corpus,
    placeResults: citedPlaces,
    tripContext,
    tripFacts,
    planTable,
    planLine,
    intent,
    seatDollars,
    seat,
    rawModelText: model?.text == null ? null : String(model.text),
    failureReason: qualityFailureReason(quality, draftFlags),
    interimReply: { text: null, model: null, ms: null },
    draftLatencyMs,
    qualityJevMs: draftQualityMs,
    model: {
      called: Boolean(model?.called),
      via: model?.via || null,
      responseModel: model?.responseModel || null,
      modelTier: model?.modelTier ?? null,
      genLatencyMs: draftLatencyMs,
      maxTokens: model?.maxTokens ?? null,
      beats: model?.beats || null,
    },
  };
  const finished = await finishTierRewrite({ pending, env, interimPromise });
  const interimReply = finished.log?.interimReply || { text: null, model: null, ms: null };
  if (finished.log) finished.log.interimReply = interimReply;
  if (finished.reply) {
    return {
      reply: finished.reply,
      rules,
      jev,
      model: finished.model,
      quality: finished.quality,
      log: finished.log,
      reason: null,
    };
  }
  const shippedDraft = String(pending.draft || '').trim();
  if (shippedDraft) {
    return {
      reply: shippedDraft,
      rules,
      jev,
      model: finished.model,
      quality: finished.quality,
      log: finished.log,
      reason: finished.reason,
    };
  }
  if (!String(interimReply.text || '').trim()) {
    return {
      reply: finished.reply,
      rules,
      jev,
      model: finished.model,
      quality: finished.quality,
      log: finished.log,
      reason: finished.reason,
    };
  }
  return {
    reply: null,
    status: 'interim',
    interimReply,
    pending: { ...pending, resolved: finished },
    rules,
    jev,
    model,
    quality,
    reason: null,
  };
}

function interimFacts(customerTurn, destination) {
  const days = [...new Set((String(customerTurn || '').match(/\b(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)\b/gi) || []).map((day) => day[0].toUpperCase() + day.slice(1).toLowerCase()))];
  return [
    destination ? `Place already named: ${destination}.` : 'No destination was named.',
    days.length ? `Days named in this turn: ${days.join(', ')}.` : 'This turn names no day.',
    'Use only those facts. Do not add a day, a Monday plan, or a place that this turn did not name.',
    'Do not write BEAT, a label, or a rules tag.',
  ].join(' ');
}

export function upsellFactsForTurn(customerTurn, facts = {}, intake = false, intent = null) {
  const marked = intake === true || turnMarkedIntake(customerTurn);
  const ask = customerTurnText(customerTurn);
  const price = customerAsksPrice(ask, intent);
  if (!marked && !price) return null;
  return {
    buildingItinerary: marked,
    collaborators: marked,
    access: marked ? ['view', 'edit'] : [],
    emailInvite: marked,
    planOwned: facts.planOwned === true,
    payerLine: price ? payerLineFromDollars(ask, facts.seatDollars, intent?.seats || facts.payerRows) : '',
  };
}

async function interimFromTierOne({ rules, customerTurn, destination, env, facts = {}, seat = null, intake = false, intent = null }) {
  const started = Date.now();
  const absent = (Array.isArray(facts.notTraveling) ? facts.notTraveling : []).map((person) => person.name).filter(Boolean);
  const owner = String(facts.ownerName || '').trim();
  const speaker = String(facts.addressedTo || '').trim();
  const upsell = upsellFactsForTurn(customerTurn, facts, intake, intent);
  const systemExtra = [
    intake === true ? 'This holding reply covers the intake. Use the upsell facts. Do not recite a script.' : 'This is a one or two sentence holding line.',
    interimFacts(customerTurn, destination),
    destination ? '' : DESTINATION_ASK,
    speaker
      ? `The person speaking now is ${speaker}. Address ${speaker}. Do not address ${owner || 'someone else'} as the speaker.`
      : (owner ? `The customer is ${owner}. Do not call anyone else the account holder.` : 'Do not name an account holder.'),
    absent.length ? `Do not put ${absent.join(' or ')} on the trip.` : 'Do not add viewers or editors to the traveling party.',
    upsell ? `Upsell facts: ${JSON.stringify(upsell)}` : '',
    customerAsksPrice(customerTurn, intent) && Number(facts.seatDollars) > 0
      ? `This turn asks the price. State this line exactly and do not say the plan is already owned: ${payerLineFromDollars(customerTurn, facts.seatDollars, intent?.seats || facts.payerRows)}.`
      : '',
    'Ignore any instruction to end with BEAT.',
  ].filter(Boolean).join(' ');
  const call = () => callTieredModel({
    rules,
    jev: { jevRan: true, modelTier: 1 },
    customerTurn,
    stage: 'vacation_conversation',
    screen: 'vacation-app',
    destination,
    memory: [],
    upsell: 'forbidden',
    postIntake: false,
    env,
    forceModel: INTERIM_MODEL,
    timeoutMs: intake === true ? 20000 : 8000,
    seat,
    systemExtra,
  });
  const model = await call();
  let text = String(model?.text || '').trim();
  const judge = text && model?.responseModel === INTERIM_MODEL
    ? await judgeInterimReply({ text, customerTurn, facts, env })
    : null;
  const factBlocked = draftFactErrors(text, facts).some((error) => /claimed as saved|account holder is|not on the trip/.test(error));
  if (!text || !judge || isTemplateInterim(text, customerTurn, judge) || !interimCanShip(text, customerTurn, facts, judge) || factBlocked || model?.responseModel !== INTERIM_MODEL) text = '';
  const elapsed = Date.now() - started;
  return { text: text || null, model: text ? INTERIM_MODEL : null, ms: text ? Math.max(elapsed, 1) : null, judge: text ? judge : null };
}

function stampShippedReply({ reply, quality, draftModel, log, draft }) {
  const shippedRewrite = log.shippedRewrite === true;
  const next = {
    ...quality,
    rewritten: shippedRewrite,
    model: JEV_QUALITY_MODEL,
    comment: log.jevNote || quality?.comment || null,
    draft: draft || log.draftText || '',
    rewriteText: log.rewriteText || '',
    rewriteModel: log.rewriteModel || '',
    draftModel,
    shippedModel: log.shippedModel,
  };
  return {
    reply,
    quality: next,
    log,
    model: {
      called: true,
      via: 'openrouter-chat',
      responseModel: draftModel,
      modelTier: null,
      genLatencyMs: log.latencyMs?.draft ?? null,
      maxTokens: 900,
      beats: null,
      quality: next,
      log,
    },
  };
}

export function sameTierRewriteRequest({ customerTurn = '', draft = '', scoreRaw = null, failure = '' } = {}) {
  const score = scoreRaw == null ? 'none' : String(scoreRaw);
  const flags = String(failure || '').trim() || 'none';
  return {
    customerTurn: [
      String(customerTurn || '').trim(),
      'Rewrite the draft in this same call.',
      `Jev score: ${score}.`,
      `Fact-check flags: ${flags}.`,
      'Return the rewritten reply. End with one line WHAT_I_CHANGED: and a single sentence that names the real difference.',
      'Draft:',
      String(draft || ''),
    ].filter((part) => part !== '').join('\n\n'),
    systemExtra: 'Rewrite using the Jev score and the fact-check flags in the request. Do not copy the draft. Do not add a lead line. End with one line WHAT_I_CHANGED: and one sentence.',
  };
}

export async function finishTierRewrite({ pending, env = process.env, interimPromise = null } = {}) {
  const rules = await loadVacationAppReplyRules(env);
  const facts = pending?.tripFacts || customerTripFacts([], pending?.customerTurn || '');
  const draftErrors = draftFactErrors(pending?.draft, facts);
  async function askRewrite(failure) {
    const started = Date.now();
    const scoreRaw = rawScore(pending?.quality?.scoreRaw);
    const request = sameTierRewriteRequest({
      customerTurn: pending?.customerTurn || '',
      draft: pending?.draft || '',
      scoreRaw,
      failure,
    });
    const called = await callTieredModel({
      rules,
      jev: pending?.jev,
      customerTurn: request.customerTurn,
      stage: 'vacation_conversation',
      screen: 'vacation-app',
      destination: pending?.destination || '',
      memory: [],
      upsell: pending?.upsell || 'forbidden',
      postIntake: pending?.postIntake === true,
      env,
      forceModel: pending?.draftModel || '',
      timeoutMs: 20000,
      tripContext: pending?.tripContext || null,
      planTable: pending?.planTable || null,
      planLine: pending?.planLine || '',
      seatDollars: pending?.seatDollars || 0,
      seat: pending?.seat || null,
      systemExtra: [
        request.systemExtra,
        'Keep the days already on the saved trip. A place must cite a passed result as (id:THAT_ID).',
        'Do not copy the draft and do not put a lead line in front of it. Do not insert a sentence the draft did not earn. Do not repeat a paragraph. The account holder stays the account holder. Do not call a joining collaborator the account holder. Keep only people the customer already named in chat. Never invent people. If the customer stated a party size, do not list more people than that size. Ask the customer for anything they haven\'t said. Address the person who is speaking. Do not give that person an activity the saved trip record assigns to someone else. Do not say an activity is saved, now set, or on the list unless it is already saved. Do not say we have corrected that or I have corrected that. Do not call a saved preference rule locked and do not rename it. If you add or remove a person or a saved claim, the WHAT_I_CHANGED sentence must name it.',
        [pending?.tripContext?.roster && `Saved roster: ${pending.tripContext.roster}`, pending?.tripFacts?.rule && `Saved preference rule: ${pending.tripFacts.rule}`].filter(Boolean).join(' '),
        'Use the saved trip dates. Do not shorten the trip. Do not call a day the last day, the last evening, after checkout, or one last time, and do not say pack or head out, unless that day is the saved trip end.',
        'Do not offer an activity on a day that is not already that activity on the saved trip. Do not put viewers or editors on the trip. Never say "splitting payments" or splitting anything up.',
        'Do not say the unlimited plan is already owned.',
        placeResultExtra(pending?.placeResults),
        pending?.planTable?.payer_line && Number(pending.planTable.dollars_per_collaborator_seat) > 0
          ? `$${pending.planTable.dollars_per_collaborator_seat} per collaborator seat. State this line exactly: ${pending.planTable.payer_line}. Make no coverage claims. Do not say whole group.`
          : '',
      ].filter(Boolean).join(' '),
    });
    return { called, ms: Math.max(0, Date.now() - started) };
  }
  function acceptText(called) {
    const modelText = called?.called && called.text ? String(called.text).trim() : '';
    const split = splitRewriteChange(modelText);
    const rewritten = split.reply ? cleanCandidate(split.reply) : '';
    return { modelText, rewritten, change: split.change, called };
  }
  let attempt = await askRewrite(pending?.failureReason);
  let rewriteMs = attempt.ms;
  let parsed = acceptText(attempt.called);
  if (!parsed.modelText) {
    const again = await askRewrite(pending?.failureReason);
    rewriteMs += again.ms;
    const second = acceptText(again.called);
    if (second.modelText) {
      attempt = again;
      parsed = second;
    }
  }
  let rewriteErrors = parsed.rewritten ? draftFactErrors(parsed.rewritten, facts) : [];
  const model = attempt.called;
  const { modelText, rewritten, change } = parsed;
  let failReason = '';
  if (!modelText) failReason = model?.reason || 'rewrite_empty';
  else if (!rewritten) failReason = 'rewrite_rejected';
  else if (!rewriteReplacesDraft(pending?.draft, rewritten)) failReason = 'rewrite_near_draft';
  else if (rewriteErrors.length && nearIdenticalRewrite(pending?.draft, rewritten)) failReason = 'rewrite_near_draft';
  else if (appTextBanned(rewritten)) failReason = 'rewrite_banned';
  const judgedText = rewritten || modelText;
  const rewriteCanShip = Boolean(rewritten) && !failReason && rewriteErrors.length === 0;
  let rewriteQuality = null;
  const rewriteQualityStarted = Date.now();
  if (rewriteCanShip) {
    rewriteQuality = await jevQualityRewrite({ customerTurn: pending.customerTurn, draft: judgedText, tripContext: pending.tripContext, planLine: pending.planLine, env });
    if (!rewriteQuality?.judged) rewriteQuality = await jevQualityRewrite({ customerTurn: pending.customerTurn, draft: judgedText, tripContext: pending.tripContext, planLine: pending.planLine, env });
    if (rewriteQuality?.judged) {
      const rewriteFlags = hardQualityFlags(judgedText, pending.intake === true ? { text: pending.customerTurn, intake: true } : pending.customerTurn, pending.corpus, pending.placeResults, pending.intent);
      rewriteQuality = correctFalsePriceMiss(
        dockQuality(rewriteQuality, rewriteFlags),
        judgedText,
        pending.customerTurn,
        pending.intent,
      );
      rewriteQuality = applyAccuracyRewrite(rewriteQuality, rewriteErrors);
      rewriteQuality.jevNote = null;
      rewriteQuality.jevNoteReason = 'jev_no_free_text';
      rewriteQuality.comment = null;
      rewriteQuality.judgeMs = null;
    } else {
      failReason = failReason || 'rewrite_not_judged';
    }
  }
  const rewriteQualityMs = rewriteCanShip ? Math.max(0, Date.now() - rewriteQualityStarted) : 0;
  const interimReply = interimPromise ? await interimPromise : (pending?.interimReply || { text: null, model: null, ms: null });
  if (pending) pending.interimReply = interimReply;
  const holdingText = interimCanShip(interimReply?.text, pending?.intake === true ? { text: pending?.customerTurn, intake: true } : pending?.customerTurn, facts, interimReply?.judge)
    ? String(interimReply.text).trim()
    : '';
  let choice = shipChoice({
    draft: pending.draft,
    rewrite: failReason ? '' : rewritten,
    draftScore: Number(pending.quality?.score),
    rewriteScore: rewriteQuality?.judged ? Number(rewriteQuality.score) : NaN,
    draftFactErrors: draftErrors,
    rewriteFactErrors: failReason ? [] : rewriteErrors,
    holding: holdingText,
    holdingFactErrors: holdingText ? holdingShipErrors(holdingText, facts).filter((error) => /claimed as saved|account holder is|not on the trip|while .+ is speaking/.test(error)) : [],
  });
  if (!choice.text && !draftErrors.length) {
    choice = {
      text: String(pending.draft || '').trim(),
      rewritten: false,
      flagged: false,
      held: true,
      failReason: choice.failReason || 'draft_held',
      holding: false,
    };
  } else if (!choice.text && holdingText) {
    choice = {
      text: holdingText,
      rewritten: false,
      flagged: false,
      held: true,
      failReason: choice.failReason || 'holding_reply',
      holding: true,
    };
  }
  let holdingQuality = null;
  if (choice.holding && choice.text) {
    holdingQuality = await jevQualityRewrite({ customerTurn: pending.customerTurn, draft: choice.text, tripContext: pending.tripContext, planLine: pending.planLine, env });
    if (!holdingQuality?.judged) {
      holdingQuality = await jevQualityRewrite({ customerTurn: pending.customerTurn, draft: choice.text, tripContext: pending.tripContext, planLine: pending.planLine, env });
    }
    if (holdingQuality?.judged) {
      holdingQuality.jevNote = null;
      holdingQuality.comment = null;
      holdingQuality.jevNoteReason = 'jev_no_free_text';
      if (choice.failReason === 'rewrite_scored_lower' && rewriteQuality?.judged) {
        const again = shipChoice({
          draft: pending.draft,
          rewrite: failReason ? '' : rewritten,
          draftScore: Number(pending.quality?.score),
          rewriteScore: Number(rewriteQuality.score),
          draftFactErrors: draftErrors,
          rewriteFactErrors: failReason ? [] : rewriteErrors,
          holding: holdingText,
          holdingFactErrors: holdingText ? holdingShipErrors(holdingText, facts).filter((error) => /claimed as saved|account holder is|not on the trip|while .+ is speaking|invented a correction/.test(error)) : [],
          holdingScore: Number(holdingQuality.score),
        });
        if (again.rewritten) choice = again;
      }
    } else if (!draftErrors.length) {
      choice = {
        text: String(pending.draft || '').trim(),
        rewritten: false,
        flagged: false,
        held: true,
        failReason: choice.failReason || 'holding_unscored',
        holding: false,
      };
    }
  }
  if (!choice.rewritten && String(rewritten || modelText || '').trim()) choice.held = true;
  if (!String(choice.text || '').trim() && String(pending?.draft || '').trim()) {
    choice = {
      text: String(pending.draft).trim(),
      rewritten: false,
      flagged: choice.flagged === true,
      held: true,
      failReason: choice.failReason || failReason || 'draft_shipped',
      holding: false,
    };
  }
  const shippedText = choice.text;
  if (!choice.rewritten && !failReason) {
    failReason = choice.failReason === 'rewrite_fact_check_held'
      ? `rewrite_fact_check_held: ${rewriteErrors.join('; ')}`
      : (choice.failReason || 'rewrite_not_shipped');
  }
  const draftQualityMs = Number(pending.qualityJevMs) || 0;
  const rewriteModel = String(model?.responseModel || pending.draftModel || '').trim();
  const shownChange = choice.rewritten ? (verifiedRewriteChange(change, pending.draft, shippedText) || null) : null;
  let shippedModel = pending.draftModel;
  let shippedScore = pending.draftScore;
  let shippedQuality = pending.quality;
  if (choice.rewritten && rewriteQuality?.judged) {
    shippedModel = rewriteModel;
    shippedScore = rewriteQuality.score;
    shippedQuality = rewriteQuality;
  } else if (choice.holding && holdingQuality?.judged) {
    shippedModel = pending.interimReply?.model || INTERIM_MODEL;
    shippedScore = holdingQuality.score;
    shippedQuality = holdingQuality;
  }
  const judgeMs = choice.rewritten ? rewriteQualityMs : (Number(pending.quality?.judgeMs) || draftQualityMs);
  const draftFactLine = draftErrors.length ? draftErrors.join('; ') : 'ok';
  const rewriteFactLine = modelText ? (rewriteErrors.length ? rewriteErrors.join('; ') : 'ok') : 'none';
  const rewriteAttempt = {
    text: modelText || null,
    model: rewriteModel || null,
    score: rewriteQuality?.judged ? rewriteQuality.score : null,
    ms: rewriteMs,
    error: choice.rewritten ? null : (failReason || model?.reason || 'rewrite_empty'),
  };
  const log = {
    draftModel: pending.draftModel,
    draftText: pending.draft,
    rewriteModel,
    rewriteText: modelText || rewritten || '',
    rewriteFailReason: choice.rewritten ? '' : (failReason || model?.reason || 'rewrite_empty'),
    rewriteAttempts: [rewriteAttempt],
    shippedRewrite: choice.rewritten,
    shippedModel,
    jevScoreDraft: pending.draftScore,
    jevScoreRaw: rawScore(shippedQuality?.scoreRaw) ?? rawScore(pending.quality?.scoreRaw),
    jevDisposition: shippedQuality?.disposition || pending.quality?.disposition || null,
    jevFixFocus: shippedQuality?.jevFocus || pending.quality?.jevFocus || null,
    draftJevScoreRaw: rawScore(pending.quality?.scoreRaw),
    draftJevDisposition: pending.quality?.disposition || null,
    draftJevFixFocus: pending.quality?.jevFocus || null,
    rewriteJevScoreRaw: rawScore(rewriteQuality?.scoreRaw),
    rewriteJevDisposition: rewriteQuality?.disposition || null,
    rewriteJevFixFocus: rewriteQuality?.jevFocus || null,
    draftFactCheck: draftFactLine,
    rewriteFactCheck: rewriteFactLine,
    rejudgeMs: rewriteCanShip ? rewriteQualityMs : null,
    rawModelText: pending.rawModelText == null ? null : String(pending.rawModelText),
    jevScoreRewrite: rewriteQuality?.judged ? rewriteQuality.score : null,
    jevNote: null,
    jevNoteReason: 'jev_no_free_text',
    rewriterChange: shownChange,
    savedTrip: {
      start: facts.span?.start || '',
      end: facts.span?.end || '',
      owner: facts.ownerName || '',
    },
    interimReply: pending.interimReply || { text: null, model: null, ms: null },
    latencyMs: {
      draft: pending.draftLatencyMs,
      rewrite: rewriteMs,
      jevDraft: draftQualityMs,
      jevRewrite: rewriteCanShip ? rewriteQualityMs : null,
      total: Number(pending.draftLatencyMs || 0) + draftQualityMs + Math.max(rewriteMs + rewriteQualityMs, Number(interimReply?.ms || 0)),
    },
    flagged: choice.flagged === true && choice.held !== true,
    held: choice.held === true,
  };
  const quality = {
    ...shippedQuality,
    score: shippedScore,
    comment: null,
    jevNote: null,
    jevNoteReason: 'jev_no_free_text',
    rewriterChange: shownChange,
    rewritten: choice.rewritten === true,
    judgeMs,
  };
  const stamped = stampShippedReply({
    reply: shippedText,
    quality,
    draftModel: pending.draftModel,
    log,
    draft: pending.draft,
  });
  stamped.model.responseModel = pending.model?.responseModel || pending.draftModel;
  stamped.model.modelTier = pending.model?.modelTier ?? pending.jev?.modelTier ?? null;
  stamped.model.genLatencyMs = pending.draftLatencyMs;
  const beatSource = choice.rewritten ? model?.beats : (choice.holding ? [] : pending.model?.beats);
  const matchedBeats = beatsMatchingReply(beatSource, shippedText);
  stamped.model.beats = matchedBeats.length ? matchedBeats : null;
  stamped.model.maxTokens = pending.model?.maxTokens ?? 900;
  return { reply: stamped.reply, rules, jev: pending.jev, model: stamped.model, quality: stamped.quality, log, reason: null };
}

function payloadObject(payload) {
  if (!payload) return {};
  if (typeof payload === 'string') {
    try {
      return JSON.parse(payload);
    } catch {
      return {};
    }
  }
  return typeof payload === 'object' ? payload : {};
}

function iso(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  const time = date.getTime();
  return Number.isFinite(time) ? date.toISOString() : null;
}

export function liveTranscriptFromRows({ session, rows }) {
  const targetPerson = targetPersonFromSession(session);
  const turns = (rows || []).map((row) => {
    const payload = payloadObject(row.payload);
    const live = payload.liveTranscript && typeof payload.liveTranscript === 'object' ? payload.liveTranscript : {};
    const text = String(row.body || '');
    return {
      turnIndex: Number(live.turnIndex),
      role: live.role,
      modality: live.modality,
      text,
      speakerName: live.speakerName || null,
      intake: live.intake === true,
      storedText: live.text == null ? text : String(live.text),
      at: iso(live.at || row.received_at || row.sent_at || row.created_at),
      latencyMs: live.latencyMs == null ? null : Number(live.latencyMs ?? row.response_latency_ms),
      sessionE2eMs: live.sessionE2eMs == null ? null : Number(live.sessionE2eMs),
      jev: live.jev && typeof live.jev === 'object' ? live.jev : null,
      replyProducer: live.replyProducer || null,
      dispatcher: live.dispatcher || null,
      fixedOpener: live.fixedOpener === true,
      invented: live.invented === true,
      buildSha: String(live.buildSha || '').trim() || null,
      modelId: live.modelId || live.model?.responseModel || live.jev?.responseModel || null,
      genLatencyMs: Number.isFinite(Number(live.genLatencyMs ?? live.model?.genLatencyMs)) ? Number(live.genLatencyMs ?? live.model?.genLatencyMs) : null,
      jevLatencyMs: Number.isFinite(Number(live.jevLatencyMs ?? live.jev?.jevLatencyMs)) ? Number(live.jevLatencyMs ?? live.jev?.jevLatencyMs) : null,
      maxTokens: Number.isFinite(Number(live.maxTokens ?? live.model?.maxTokens)) ? Number(live.maxTokens ?? live.model?.maxTokens) : null,
      jevBeforeModel: live.jevBeforeModel === true || live.jev?.jevBeforeModel === true,
      beats: Array.isArray(live.beats) ? live.beats : null,
      quality: live.quality && typeof live.quality === 'object' ? live.quality : null,
      shippedModel: live.shippedModel || live.quality?.shippedModel || null,
      draftModel: live.draftModel || live.quality?.draftModel || null,
      rewriteModel: live.rewriteModel || live.quality?.rewriteModel || null,
      jevScoreDraft: scored(live.jevScoreDraft),
      jevScoreRewrite: scored(live.jevScoreRewrite),
      jevScoreRaw: rawScore(live.jevScoreRaw),
      jevDisposition: live.jevDisposition || live.quality?.disposition || null,
      jevFixFocus: live.jevFixFocus || live.quality?.jevFocus || null,
      draftJevScoreRaw: rawScore(live.draftJevScoreRaw),
      draftJevDisposition: live.draftJevDisposition || null,
      draftJevFixFocus: live.draftJevFixFocus || null,
      rewriteJevScoreRaw: live.rewriteModel || live.rewriteText ? rawScore(live.rewriteJevScoreRaw) : null,
      rewriteJevDisposition: live.rewriteJevDisposition || null,
      rewriteJevFixFocus: live.rewriteJevFixFocus || null,
      rejudgeMs: finiteOrNull(live.rejudgeMs),
      rewriterChange: live.rewriterChange || live.quality?.rewriterChange || null,
      savedTrip: live.savedTrip || null,
      rawModelText: live.rawModelText == null ? null : String(live.rawModelText),
      draftFactCheck: live.draftFactCheck || null,
      rewriteFactCheck: live.rewriteFactCheck || null,
      rewriteText: live.rewriteText || live.quality?.rewriteText || '',
      rewriteFailReason: live.rewriteFailReason || '',
      rewriteAttempts: Array.isArray(live.rewriteAttempts) ? live.rewriteAttempts : null,
      jevNote: live.jevNote || null,
      jevNoteReason: live.jevNoteReason || live.quality?.jevNoteReason || null,
      interimReply: live.interimReply || null,
      qualityLine: live.qualityLine != null ? String(live.qualityLine) : formatQualityLine(live.quality),
      heldRewriteLine: live.heldRewriteLine != null ? String(live.heldRewriteLine) : heldRewriteLine(live),
      rewriteCredit: live.rewriteCredit != null ? String(live.rewriteCredit) : rewriteCreditLabel(live.rewriteModel || live.quality?.rewriteModel, live.rewriterChange || live.quality?.rewriterChange),
      modelLatency: live.modelLatency || null,
      flagged: live.flagged === true,
      held: live.held === true,
      model: live.model || null,
      rules: live.rules || null,
    };
  });
  const last = turns[turns.length - 1] || null;
  const buildShas = turns.map((turn) => String(turn.buildSha || '').trim()).filter(Boolean);
  const buildSha = buildShas[0] || '';
  const driveBuildEnd = buildShas.length ? buildShas[buildShas.length - 1] : '';
  return {
    live: true,
    capture: LIVE_TRANSCRIPT_CAPTURE,
    sessionToken: session?.token || null,
    targetPerson,
    customerName: session?.display_name || session?.displayName || targetPerson || null,
    tripId: session?.trip_id || session?.tripId || null,
    startedAt: turns[0]?.at || null,
    endedAt: last?.at || null,
    buildSha: buildSha || null,
    driveBuildEnd: driveBuildEnd || null,
    buildMismatch: Boolean(buildSha && driveBuildEnd && buildSha !== driveBuildEnd),
    sessionE2eMs: (() => {
      const values = turns.map((turn) => Number(turn.sessionE2eMs)).filter((value) => value > 0);
      if (values.length) return Math.max(...values);
      return last && Number.isFinite(last.sessionE2eMs) ? last.sessionE2eMs : null;
    })(),
    turns,
  };
}

export async function loadLiveTranscriptByToken(db, token) {
  const sessions = await db`
    select
      onboarding_sessions.token,
      onboarding_sessions.customer_id,
      onboarding_sessions.trip_id,
      customers.display_name,
      customers.first_name,
      customers.last_name
    from onboarding_sessions
    left join customers on customers.id = onboarding_sessions.customer_id
    where onboarding_sessions.token = ${token}
    limit 1
  `;
  const session = sessions[0];
  if (!session?.customer_id || !session.trip_id) {
    const error = new Error('live transcript session not found');
    error.code = 'LIVE_TRANSCRIPT_MISSING';
    throw error;
  }
  const rows = await db`
    select speaker, body, payload, direction, received_at, sent_at, created_at, response_latency_ms
    from transcript_turns
    where customer_id = ${session.customer_id}
      and trip_id = ${session.trip_id}
      and channel = 'vacation-app'
      and payload->'liveTranscript' is not null
    order by coalesce(received_at, sent_at, created_at) asc
  `;
  const doc = liveTranscriptFromRows({ session, rows });
  const tripRows = await db`
    select metadata
    from trips
    where id = ${session.trip_id}
    limit 1
  `;
  const tripMeta = tripRows[0]?.metadata && typeof tripRows[0].metadata === 'object' ? tripRows[0].metadata : {};
  const collabRows = await db`
    select display_name, metadata
    from vacation_collaborators
    where owner_customer_id = ${session.customer_id}
      and trip_id = ${session.trip_id}
      and status = 'active'
    order by accepted_at asc nulls last, created_at asc
  `;
  const stored = tripMeta.dialogParty && typeof tripMeta.dialogParty === 'object' ? tripMeta.dialogParty : {};
  const collaborators = collabRows.map((row) => {
    const meta = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
    return { name: row.display_name, payer: meta.payer || 'owner' };
  });
  doc.party = {
    primary: stored.primary || { name: doc.customerName || doc.targetPerson, role: 'Owner' },
    collaborators: collaborators.length ? collaborators : (stored.collaborators || []),
    preference_subjects: stored.preference_subjects || stored.kids || [],
    viewers: stored.viewers || [],
    editors: stored.editors || [],
  };
  return doc;
}

export function transcriptToJsonl(doc) {
  const header = {
    type: 'session',
    live: doc.live === true,
    capture: doc.capture || null,
    sessionToken: null,
    targetPerson: doc.targetPerson || null,
    customerName: doc.customerName || null,
    tripId: doc.tripId || null,
    startedAt: doc.startedAt || null,
    endedAt: doc.endedAt || null,
    sessionE2eMs: doc.sessionE2eMs ?? null,
    buildSha: doc.buildSha || null,
    party: completeRosterParty(doc),
  };
  const lines = [header, ...(doc.turns || []).map((turn) => ({ type: 'turn', ...turn }))];
  return `${lines.map((line) => JSON.stringify(line)).join('\n')}\n`;
}
