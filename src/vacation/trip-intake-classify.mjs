import {
  DEFAULT_JEV_DECISIONS_URL,
  JEV_QUALITY_MODEL,
  OPENROUTER_CHAT_COMPLETIONS_URL,
  bakeoffTierModels,
  openRouterAppKey,
} from '../../scripts/vacation-app-reply-rules.mjs';

const KINDS = new Set(['activity', 'restaurant', 'hotel', 'flight', 'car', 'store']);
const INTAKE_THRESHOLD = 0.5;

const ROSTER_ROLES = new Set(['owner', 'collaborator', 'child', 'viewer', 'editor']);

const THING_SYSTEM = [
  'Extract what the customer wants from one vacation chat message.',
  'Return JSON only, with this shape: {"things":[{"name":string,"kind":string,"who":string,"when":string}],"roster":[{"name":string,"role":string,"age":number|null}],"destination":string,"hasDates":boolean,"title":string}.',
  'name is their wording for one wanted item. kind is activity, restaurant, hotel, flight, car, or store.',
  'who is a person they named for that item, or an empty string. when is a time they stated for that item, or an empty string.',
  'roster lists people this message names. role is owner, collaborator, child, viewer, or editor. age is a number only when they stated a child age, otherwise null.',
  'Also return "destination" as a place they named or an empty string, "hasDates" as true only when they stated a date, range, or trip length, and "title" as a trip name they stated or an empty string.',
  'List only items and people this message asks for. Do not invent items, names, times, people, places, dates, or a title.',
].join(' ');

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
    things: parsed.things,
    roster: Array.isArray(parsed.roster) ? parsed.roster : [],
    destination: parsed.destination,
    hasDates: parsed.hasDates === true,
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
    people.push({ name, role, age: Number.isFinite(age) ? age : null });
  }
  return people;
}

const CHAT_EXTRACTION = 'chat_extraction';

function cleanThings(list) {
  const things = [];
  const seen = new Set();
  for (const item of list) {
    const name = clean(item?.name || item?.title, 180);
    if (!name) continue;
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
    title,
    destinationError: ok ? (destination ? null : 'trip place was not in the extraction') : clean(classification?.error || 'trip intake classification failed', 300),
    titleError: ok ? (title ? null : 'trip title was not in the extraction') : clean(classification?.error || 'trip intake classification failed', 300),
    intakeError: ok ? null : clean(classification?.error || 'trip intake classification failed', 300),
  };
}

export function tripIntakeConfig(env = process.env) {
  return {
    apiKey: openRouterAppKey(env),
    routerModel: env.JEV_ROUTER_MODEL || env.TIMESYNCHER_JEV_ROUTER_MODEL || JEV_QUALITY_MODEL,
  };
}

export async function classifyTripIntake({ text, env = process.env, apiKey, routerModel, fetchImpl = fetch } = {}) {
  const message = clean(text, 6000);
  const failed = (error) => ({
    ok: false,
    intake: false,
    things: [],
    roster: [],
    destination: '',
    hasDates: false,
    title: '',
    error: clean(error, 300) || 'trip intake classification failed',
  });
  if (!message) return { ok: true, intake: false, things: [], roster: [], destination: '', hasDates: false, title: '', error: null };
  const config = tripIntakeConfig(env);
  const key = apiKey ?? config.apiKey;
  const model = routerModel || config.routerModel;
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
    const extracted = await postJson(fetchImpl, OPENROUTER_CHAT_COMPLETIONS_URL, key, {
      model: bakeoffTierModels()[1],
      temperature: 0,
      messages: [
        { role: 'system', content: THING_SYSTEM },
        { role: 'user', content: message },
      ],
    }, 'TimeSyncher Vacation trip intake');
    const extractedFields = parseExtraction(chatText(extracted));
    const things = cleanThings(extractedFields.things);
    const roster = cleanRoster(extractedFields.roster);
    return {
      ok: true,
      intake: score >= INTAKE_THRESHOLD,
      things,
      roster,
      destination: clean(extractedFields.destination, 180),
      hasDates: extractedFields.hasDates === true,
      title: clean(extractedFields.title, 180),
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
