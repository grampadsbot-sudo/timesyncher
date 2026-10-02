import {
  DEFAULT_JEV_DECISIONS_URL,
  JEV_QUALITY_MODEL,
  OPENROUTER_CHAT_COMPLETIONS_URL,
  bakeoffTierModels,
  openRouterAppKey,
} from '../../scripts/vacation-app-reply-rules.mjs';
import { intakeThingHasProperName } from './intake-thing-name.mjs';
import {
  PLACE_SEARCH_CATEGORY_KEYS,
  intakePlaceSearchCategoryError,
  normalizePlaceSearchCategory,
} from './place-search-category-keys.mjs';
import { tripIntakeExtractionJsonSchema } from './trip-intake-extraction-schema.mjs';

export { intakeThingHasProperName } from './intake-thing-name.mjs';

const KINDS = new Set(['activity', 'restaurant', 'hotel', 'flight', 'car', 'store']);
const INTAKE_THRESHOLD = 0.5;

const ROSTER_ROLES = new Set(['owner', 'collaborator', 'child', 'viewer', 'editor']);

const TURN_KIND_TRIP_INTAKE = ['trip', 'intake'].join('_');
const TURN_KINDS = new Set(['place_search', 'web_research', TURN_KIND_TRIP_INTAKE, 'other']);
const TURN_KIND_ENUM = `"place_search"|"web_research"|"${TURN_KIND_TRIP_INTAKE}"|"other"`;

export const TRIP_INTAKE_HAS_DATES_PROMPT = 'hasDates is true only when the customer stated calendar trip dates (a month and day or a full date range). Clock times, arrival or departure times of day, relative logistics, and durations without a calendar date make hasDates false.';

export const TRIP_INTAKE_EXTRACTION_SYSTEM_PROMPT = [
  'Classify one customer chat message and extract fields.',
  `Return JSON only: {"turnKind":${TURN_KIND_ENUM},"target":string,"anchor":string,"anchorIsLodging":boolean,"category":string,"question":string,"things":[{"name":string,"kind":string,"who":string,"when":string}],"roster":[{"name":string,"role":string,"age":null}],"inviteeName":string,"inviteeEmail":string,"destination":string,"hasDates":boolean,"startDate":string,"endDate":string,"title":string}.`,
  'In that JSON, target is the customer specific place wording for their ask (for example tacos, taco spots, or snorkeling); category is separate and only scopes map or OSM place-type filters.',
  `turnKind place_search when they want nearby or in-area places; web_research for events, weather, or general web facts; ${TURN_KIND_TRIP_INTAKE} when describing the trip to plan; other otherwise.`,
  'For place_search, target must be their specific ask in their words (never the category label); anchor is the area or reference point they named in their words; anchorIsLodging true when that reference is their hotel, lodging, resort, or where they are staying (including phrases like near our hotel or by the place we are staying at), false when they named a geographic area or neighborhood instead.',
  `For place_search, category is required and must be exactly one of: ${PLACE_SEARCH_CATEGORY_KEYS.join(', ')} (map or OSM place-type scope only; never copy category into target).`,
  'For web_research, question is the research ask in their words; leave target, anchor, category empty and anchorIsLodging false.',
  `For ${TURN_KIND_TRIP_INTAKE} or other, leave target, anchor, category, question empty and anchorIsLodging false unless they named lodging as part of trip planning.`,
  'things: name is their wording for one wanted item; kind is activity, restaurant, hotel, flight, car, or store; who and when are strings or empty.',
  'things must be proper names only (a named hotel, restaurant, store, or venue), never generic categories like taco spots or mid-range options.',
  `For ${TURN_KIND_TRIP_INTAKE}, when they state a named lodging property where they will stay (hotel, resort, inn, condo, rental, or similar), include exactly one things entry with kind hotel and name set to that property name; when they also name the neighborhood or area for the stay, set destination to that area.`,
  'roster lists people named; role is owner, collaborator, child, viewer, or editor; age is a number only when they stated a child age.',
  'inviteeName and inviteeEmail are filled only when the customer asks to add or invite a person to the trip, with that person name and email as they wrote them; otherwise leave both empty.',
  TRIP_INTAKE_HAS_DATES_PROMPT,
  'When hasDates is true, startDate and endDate are required YYYY-MM-DD; resolve any stated calendar range in the message into full ISO start and end days. When hasDates is false, leave startDate and endDate empty. Do not invent items, names, times, people, places, dates, or titles.',
].join(' ');

const THING_SYSTEM = TRIP_INTAKE_EXTRACTION_SYSTEM_PROMPT;

export { tripIntakeExtractionJsonSchema } from './trip-intake-extraction-schema.mjs';

const EXTRACTION_THING_SLOTS = 8;
const EXTRACTION_ROSTER_SLOTS = 6;

export function tripIntakeExtractionMaxTokens(schema = tripIntakeExtractionJsonSchema()) {
  const root = schema?.json_schema?.schema || {};
  const required = Array.isArray(root.required) ? root.required : [];
  const thingRequired = root.properties?.things?.items?.required || [];
  const rosterRequired = root.properties?.roster?.items?.required || [];
  const sample = {};
  for (const key of required) {
    const property = root.properties?.[key] || {};
    if (property.type === 'array') sample[key] = [];
    else if (property.type === 'boolean') sample[key] = false;
    else sample[key] = '';
  }
  sample.things = Array.from({ length: EXTRACTION_THING_SLOTS }, () => {
    const item = {};
    for (const key of thingRequired) item[key] = 'named place saturday dinner';
    return item;
  });
  sample.roster = Array.from({ length: EXTRACTION_ROSTER_SLOTS }, () => {
    const item = {};
    for (const key of rosterRequired) item[key] = key === 'age' ? 8 : 'named person';
    return item;
  });
  return Math.max(2048, Math.ceil(JSON.stringify(sample).length / 3));
}

export function tripIntakeExtractionChatRequest({ message, model }) {
  return {
    model,
    temperature: 0,
    max_tokens: tripIntakeExtractionMaxTokens(),
    provider: { require_parameters: true },
    response_format: tripIntakeExtractionJsonSchema(),
    messages: [
      { role: 'system', content: THING_SYSTEM },
      { role: 'user', content: clean(message, 6000) },
    ],
  };
}

export function intakeExtractionDatesError(extractedFields = {}) {
  if (extractedFields.hasDates !== true) return '';
  const start = isoDay(extractedFields.startDate);
  const end = isoDay(extractedFields.endDate);
  if (!start || !end) return 'trip intake extraction dates required when hasDates is true';
  if (end < start) return 'trip intake extraction endDate before startDate';
  return '';
}

function isoDay(value) {
  const match = String(value || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return '';
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) return '';
  return `${match[1]}-${match[2]}-${match[3]}`;
}

function normalizeTurnKind(value) {
  const kind = clean(value, 40).toLowerCase();
  return TURN_KINDS.has(kind) ? kind : 'other';
}

function clean(value, max) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function decisionScore(answer) {
  if (!answer || typeof answer !== 'object') return null;
  const direct = Number(answer.noul ?? answer.probability ?? answer.score);
  if (Number.isFinite(direct)) return Math.max(0, Math.min(1, direct));
  const choice = String(answer.choice || '').toLowerCase();
  if (choice === 'true' || choice === 'yes') return 1;
  if (choice === 'false' || choice === 'no') return 0;
  return null;
}

function chatText(body) {
  const content = body?.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map((part) => part?.text || '').join('');
  return '';
}

function parseExtraction(raw) {
  const trimmed = String(raw || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/i, '').trim();
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('trip intake extraction was not JSON');
  const parsed = JSON.parse(trimmed.slice(start, end + 1));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('trip intake extraction was not JSON');
  if (!Array.isArray(parsed.things)) throw new Error('trip intake extraction missing things');
  return {
    turnKind: normalizeTurnKind(parsed.turnKind),
    target: parsed.target,
    anchor: parsed.anchor,
    anchorIsLodging: parsed.anchorIsLodging === true,
    category: parsed.category,
    question: parsed.question ?? parsed.webQuestion,
    things: parsed.things,
    roster: Array.isArray(parsed.roster) ? parsed.roster : [],
    inviteeName: parsed.inviteeName,
    inviteeEmail: parsed.inviteeEmail,
    destination: parsed.destination,
    hasDates: parsed.hasDates === true,
    startDate: parsed.startDate,
    endDate: parsed.endDate,
    title: parsed.title,
  };
}

function cleanRoster(list) {
  const people = [];
  const seen = new Set();
  for (const item of Array.isArray(list) ? list : []) {
    const name = clean(item?.name, 120);
    const role = clean(item?.role, 40).toLowerCase();
    if (!name || !ROSTER_ROLES.has(role)) continue;
    const key = `${role}:${name.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const rawAge = item?.age;
    const age = rawAge === null || rawAge === undefined || rawAge === '' ? null : Number(rawAge);
    const payer = clean(item?.payer, 80);
    people.push({ name, role, age: Number.isFinite(age) ? age : null, ...(payer ? { payer } : {}) });
  }
  return people;
}

const CHAT_EXTRACTION = 'chat_extraction';

function cleanThings(list) {
  const things = [];
  const seen = new Set();
  for (const item of list) {
    const name = clean(item?.name || item?.title, 180);
    if (!name || !intakeThingHasProperName(name)) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    things.push({
      name,
      kind: clean(item?.kind || item?.category, 40).toLowerCase(),
      who: clean(item?.who, 120),
      when: clean(item?.when || item?.whenLabel, 180),
      source: CHAT_EXTRACTION,
    });
  }
  return things;
}

async function postJson(fetchImpl, url, key, body, title) {
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${key}`,
      'content-type': 'application/json',
      accept: 'application/json',
      'HTTP-Referer': 'https://timesyncher.com',
      'X-Title': title,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.ok === false) {
    const message = payload?.error?.message || payload?.error || `HTTP ${response.status}`;
    throw new Error(clean(message, 300) || `HTTP ${response.status}`);
  }
  return payload;
}

export function thingsFromIntake(extracted) {
  return cleanThings(Array.isArray(extracted) ? extracted : []).map((thing) => ({
    title: thing.name,
    category: KINDS.has(thing.kind) ? thing.kind : 'activity',
    description: '',
    who: thing.who,
    whenLabel: thing.when,
    customerWhen: '',
    notes: [],
    collaboratorNotes: [],
    source: thing.source || CHAT_EXTRACTION,
  }));
}

export function intakeLodgingThings(extracted) {
  return thingsFromIntake(extracted).filter((thing) => thing.category === 'hotel');
}

/** Merge classifier things with job wantedThings when the live queue passes only one shape. */
export function intakeLodgingWanted(extracted = [], fallbackWanted = []) {
  const primary = intakeLodgingThings(extracted);
  if (primary.length) return primary;
  return intakeLodgingThings(fallbackWanted);
}

export function intakeActivityThings(extracted) {
  return thingsFromIntake(extracted).filter((thing) => thing.category !== 'hotel');
}

export function mergeWantedThings(things, extracted) {
  const next = Array.isArray(things) ? [...things] : [];
  const have = new Set(next.map((thing) => clean(thing?.title, 180).toLowerCase()).filter(Boolean));
  for (const thing of thingsFromIntake(extracted)) {
    const key = thing.title.toLowerCase();
    if (have.has(key)) continue;
    have.add(key);
    next.push(thing);
  }
  return next;
}

export function tripIntakeJobFields({ requestText, receivedAt, classification, firstIntake, jobKind }) {
  const ok = classification?.ok === true;
  const intake = ok && classification.intake === true;
  const wantedThings = ok ? cleanThings(classification.things) : [];
  const roster = ok ? cleanRoster(classification.roster) : [];
  const destination = ok ? clean(classification.destination, 180) : '';
  const title = ok ? clean(classification.title, 180) : '';
  const hasDates = ok && classification.hasDates === true;
  const startDate = ok ? isoDay(classification.startDate) : '';
  const endDate = ok ? isoDay(classification.endDate) : '';
  return {
    intakeEvent: intake ? {
      kind: jobKind,
      at: receivedAt || null,
      requestText: String(requestText || ''),
      firstIntake: firstIntake === true,
    } : null,
    wantedThings,
    roster,
    rosterError: ok ? null : clean(classification?.error || 'trip intake classification failed', 300),
    destination,
    hasDates,
    startDate,
    endDate,
    title,
    destinationError: ok ? (destination ? null : 'trip place was not in the extraction') : clean(classification?.error || 'trip intake classification failed', 300),
    titleError: ok ? (title ? null : 'trip title was not in the extraction') : clean(classification?.error || 'trip intake classification failed', 300),
    intakeError: ok ? null : clean(classification?.error || 'trip intake classification failed', 300),
  };
}

function tripIntakeConfig(env = process.env) {
  return {
    apiKey: openRouterAppKey(env),
    routerModel: env.JEV_ROUTER_MODEL || env.TIMESYNCHER_JEV_ROUTER_MODEL || JEV_QUALITY_MODEL,
  };
}

export async function classifyTripIntake({
  text,
  env = process.env,
  apiKey,
  routerModel,
  fetchImpl = fetch,
  requireExtractedTripDates = false,
} = {}) {
  const message = clean(text, 6000);
  const config = tripIntakeConfig(env);
  const model = routerModel || config.routerModel;
  const failed = (error) => ({
    ok: false,
    intake: false,
    turnKind: null,
    target: '',
    anchor: '',
    anchorIsLodging: false,
    category: '',
    question: '',
    things: [],
    roster: [],
    inviteeName: '',
    inviteeEmail: '',
    destination: '',
    hasDates: false,
    title: '',
    routerModel: model || null,
    error: clean(error, 300) || 'trip intake classification failed',
  });
  if (!message) {
    return {
      ok: true,
      intake: false,
      turnKind: 'other',
      target: '',
      anchor: '',
      anchorIsLodging: false,
      category: '',
      question: '',
      things: [],
      roster: [],
      inviteeName: '',
      inviteeEmail: '',
      destination: '',
      hasDates: false,
      title: '',
      routerModel: model || null,
      error: null,
    };
  }
  const key = apiKey ?? config.apiKey;
  if (!key) return failed('trip intake classifier needs an OpenRouter key');
  try {
    const decision = await postJson(fetchImpl, DEFAULT_JEV_DECISIONS_URL, key, {
      model,
      state: { channel: 'vacation-app', current_turn: message },
      questions: {
        trip_intake: {
          type: 'noul',
          instructions: 'Is this customer message a trip intake? True when they are describing a vacation to plan: where, when, who is going, or what they want to do. False for a short follow-up, a price or access question, or a small change that is not a trip description.',
        },
      },
    }, 'TimeSyncher Vacation trip intake');
    const score = decisionScore(decision?.answers?.trip_intake);
    if (score == null) return failed('trip intake classifier returned no decision');
    const extractionModel = bakeoffTierModels()[1];
    const extracted = await postJson(
      fetchImpl,
      OPENROUTER_CHAT_COMPLETIONS_URL,
      key,
      tripIntakeExtractionChatRequest({ message, model: extractionModel }),
      'TimeSyncher Vacation trip intake',
    );
    const extractedFields = parseExtraction(chatText(extracted));
    const categoryError = intakePlaceSearchCategoryError(extractedFields);
    if (categoryError) return failed(categoryError);
    const turnKind = extractedFields.turnKind;
    const things = cleanThings(extractedFields.things);
    const roster = cleanRoster(extractedFields.roster);
    const intake = turnKind === TURN_KIND_TRIP_INTAKE && score >= INTAKE_THRESHOLD;
    if (requireExtractedTripDates && intake) {
      const datesError = intakeExtractionDatesError(extractedFields);
      if (datesError) return failed(datesError);
    }
    return {
      ok: true,
      turnKind,
      target: clean(extractedFields.target, 240),
      anchor: clean(extractedFields.anchor, 180),
      anchorIsLodging: extractedFields.anchorIsLodging === true,
      category: normalizePlaceSearchCategory(extractedFields.category),
      question: clean(extractedFields.question, 600),
      intake,
      things,
      roster,
      inviteeName: clean(extractedFields.inviteeName, 180),
      inviteeEmail: clean(extractedFields.inviteeEmail, 180).toLowerCase(),
      destination: clean(extractedFields.destination, 180),
      hasDates: extractedFields.hasDates === true,
      startDate: isoDay(extractedFields.startDate),
      endDate: isoDay(extractedFields.endDate),
      title: clean(extractedFields.title, 180),
      routerModel: model,
      error: null,
    };
  } catch (error) {
    return failed(error?.message || error);
  }
}

export async function searchIntakePlace({ destination = '', title = '', query = '' } = {}) {
  const placeQuery = clean(query || destination || title, 180);
  if (!placeQuery) return { ok: false, error: 'trip place was not in the extraction' };
  try {
    const { runPublicResearch } = await import('../../scripts/vacation-public-research-worker.mjs');
    const result = await runPublicResearch({
      artifacts: { destination: placeQuery, requestText: placeQuery },
    });
    if (!Number(result?.sourceBackedCandidateCount)) {
      return { ok: false, error: clean(result?.note || result?.status || 'live search returned no place', 300) };
    }
    return { ok: true, error: null };
  } catch (error) {
    return { ok: false, error: clean(error?.message || error, 300) || 'live search failed' };
  }
}

export async function resolveIntakePlace({
  destination = '',
  title = '',
  destinationError = null,
  titleError = null,
  searchImpl = searchIntakePlace,
} = {}) {
  const namedDestination = clean(destination, 180);
  const namedTitle = clean(title, 180);
  const query = namedDestination || namedTitle;
  if (!query) {
    return {
      destination: '',
      title: '',
      destinationError: destinationError || 'trip place was not in the extraction',
      titleError: titleError || 'trip title was not in the extraction',
    };
  }
  let found;
  try {
    found = await searchImpl({ destination: namedDestination, title: namedTitle, query });
  } catch (error) {
    found = { ok: false, error: error?.message || error };
  }
  if (!found || found.ok !== true) {
    const error = clean(found?.error || 'live search returned no place', 300);
    return { destination: '', title: '', destinationError: error, titleError: error };
  }
  return {
    destination: namedDestination,
    title: namedTitle,
    destinationError: namedDestination ? null : (destinationError || 'trip place was not in the extraction'),
    titleError: namedTitle ? null : (titleError || 'trip title was not in the extraction'),
  };
}
