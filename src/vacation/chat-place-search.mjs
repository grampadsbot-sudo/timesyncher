import { insertTripThing } from './trip-things.mjs';
import { placeToTripThing, searchPlaces } from './place-search.mjs';

const SEARCH_VERB = /\b(find|search(?:\s+for)?|look(?:ing)?\s+for|suggest|recommend|show me)\b/i;
const PLAN_INTAKE = /\b(plan a|planning a|we(?:'re| are) going for|who is going|our trip to|week in|days in)\b/i;

function inferSearchCategory(text = '') {
  const lower = String(text).toLowerCase();
  if (/\b(taco|restaurant|seafood|dinner|lunch|breakfast|brunch|coffee|cafe|food|dining|splurge|kid-?friendly)\b/.test(lower)) return 'restaurant';
  if (/\b(toy|book\s*store|bookstore|shop|store|shopping|boutique)\b/.test(lower)) return 'store';
  return 'activity';
}

function searchAnchorFromTurn(text = '', tripDestination = '') {
  const source = String(text || '').replace(/\s+/g, ' ').trim();
  const near = source.match(/\b(?:near|around|within(?:\s+walking\s+distance\s+of)?|close to|by)\s+(.+?)(?:[,.!?]|$)/i);
  if (near?.[1]) return near[1].trim().slice(0, 180);
  const inCity = source.match(/\b(?:in|for)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,4})\b/);
  if (inCity?.[1]) return inCity[1].trim().slice(0, 180);
  return String(tripDestination || '').trim().slice(0, 180);
}

export function isCustomerPlaceSearchTurn(text = '') {
  const source = String(text || '').replace(/\s+/g, ' ').trim();
  if (!source || source.length < 12) return false;
  if (PLAN_INTAKE.test(source)) return false;
  if (!SEARCH_VERB.test(source)) return false;
  return /\b(restaurant|taco|seafood|coffee|cafe|shop|store|bookstore|book\s+store|toy|things to do|museum|ferry|ferries|train|trains|monorail|attraction|dinner|splurge|kid-?friendly|pike place|downtown|water view|walking distance|7\s*year\s*old)\b/i.test(source);
}

function emptyTripIntakeClassification() {
  return {
    ok: true,
    intake: false,
    things: [],
    roster: [],
    destination: '',
    hasDates: false,
    title: '',
    error: null,
  };
}

async function resolveTripIntakeForCustomerTurn({ text = '', env = process.env, classifyImpl } = {}) {
  const placeSearchTurn = isCustomerPlaceSearchTurn(text);
  const classification = placeSearchTurn
    ? emptyTripIntakeClassification()
    : await classifyImpl({ text, env });
  return { classification, placeSearchTurn };
}

export async function classifyVacationAppCustomerTurn(requestText, env, classifyImpl) {
  return resolveTripIntakeForCustomerTurn({ text: requestText, env, classifyImpl });
}

export function intakeExtractedThings(placeSearchTurn, classification) {
  if (placeSearchTurn) return [];
  return classification?.ok === true ? classification.things : [];
}

function queriesFromCustomerSearchTurn(customerTurn = '', tripDestination = '') {
  const text = String(customerTurn || '').replace(/\s+/g, ' ').trim();
  const category = inferSearchCategory(text);
  const destination = searchAnchorFromTurn(text, tripDestination);
  return {
    destination,
    queries: [{
      category,
      q: text.slice(0, 240),
      limit: 5,
      place: true,
    }],
  };
}

function placesToChatResultRows(places = []) {
  return (Array.isArray(places) ? places : []).flatMap((place) => {
    const thing = placeToTripThing(place);
    const sourceRef = thing?.metadata?.sourceRef;
    const id = String(sourceRef?.id || '').trim();
    const name = String(thing?.title || '').trim();
    if (!id || !name) return [];
    return [{ name, title: name, sourceRef: { source: String(sourceRef.source || thing.source || ''), id } }];
  });
}

export async function runCustomerChatPlaceSearch({
  customerTurn = '',
  tripDestination = '',
  lodging = '',
  env = process.env,
  fetchImpl = globalThis.fetch,
  searchImpl = searchPlaces,
} = {}) {
  if (!isCustomerPlaceSearchTurn(customerTurn)) return { status: 'skip' };
  const plan = queriesFromCustomerSearchTurn(customerTurn, tripDestination);
  if (!plan.destination) {
    const error = 'Place search needs a trip destination or a named area in the message.';
    console.error(`customer chat place search refused: ${error}`);
    return { status: 'failed', error, placeResults: [], things: [] };
  }
  try {
    const search = await searchImpl({
      destination: plan.destination,
      lodging,
      queries: plan.queries,
      env,
      fetchImpl,
    });
    const places = Array.isArray(search?.places) ? search.places : [];
    if (!places.length) {
      const error = `Place search returned no results for ${plan.destination}.`;
      console.error(`customer chat place search failed: ${error}`);
      return { status: 'failed', error, placeResults: [], things: [], search };
    }
    const things = places.map((place) => placeToTripThing(place));
    const placeResults = placesToChatResultRows(places);
    return { status: 'ok', error: null, places, things, placeResults, search };
  } catch (error) {
    const message = String(error?.message || error || 'place search failed').trim();
    console.error(`customer chat place search failed: ${message}`);
    return { status: 'failed', error: message, placeResults: [], things: [] };
  }
}

export async function applyChatPlaceSearchForVacationTurn({
  db,
  tripId,
  requestId,
  customerTurn,
  tripDestination,
  payload,
  customerLive,
  turnId,
  env = process.env,
  publishShare,
  searchImpl,
} = {}) {
  const placeSearchTurn = isCustomerPlaceSearchTurn(customerTurn);
  if (placeSearchTurn) {
    payload.wantedThings = [];
    payload.placeSearchTurn = true;
    customerLive.placeSearchTurn = true;
  }
  const chatSearch = await runCustomerChatPlaceSearch({ customerTurn, tripDestination, env, searchImpl });
  if (chatSearch.status === 'skip') return { kind: 'skip', placeResults: [], placeSearchTurn };
  if (chatSearch.status === 'failed') {
    const placeSearch = { status: 'failed', error: chatSearch.error };
    payload.placeSearch = placeSearch;
    customerLive.placeSearch = placeSearch;
    await db`
      update transcript_turns
      set payload = ${payload}
      where id = ${turnId}
    `;
    return { kind: 'failed', error: chatSearch.error, placeSearch, placeSearchTurn };
  }
  for (const thing of chatSearch.things) {
    await insertTripThing(db, { tripId, requestId, thing });
  }
  const placeSearch = {
    status: 'ok',
    resultIds: chatSearch.placeResults.map((row) => row.sourceRef.id),
    sources: chatSearch.things.map((thing) => thing.source).filter(Boolean),
  };
  payload.placeSearch = placeSearch;
  customerLive.placeSearch = placeSearch;
  if (chatSearch.things.length && publishShare) await publishShare(db, tripId);
  await db`
    update transcript_turns
    set payload = ${payload}
    where id = ${turnId}
  `;
  return { kind: 'ok', placeResults: chatSearch.placeResults, placeSearch, placeSearchTurn };
}
