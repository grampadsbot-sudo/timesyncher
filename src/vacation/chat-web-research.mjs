import { insertTripThing } from './trip-things.mjs';
import { noteToTripThing } from './place-search.mjs';
import { searchTavily } from './poi-search.mjs';
import { buildProviderEnv } from './provider-env.mjs';
import { inTurnSearchTelemetry } from './in-turn-search-telemetry.mjs';

import { isCustomerPlaceSearchTurn, PLAN_INTAKE, WEB_RESEARCH } from './place-search-intent.mjs';

function isCustomerWebResearchTurn(text = '') {
  const source = String(text || '').replace(/\s+/g, ' ').trim();
  if (!source || source.length < 15) return false;
  if (isCustomerPlaceSearchTurn(source)) return false;
  if (PLAN_INTAKE.test(source)) return false;
  return /\?/.test(source) && WEB_RESEARCH.test(source);
}

function webResultsToChatRows(notes = []) {
  return (Array.isArray(notes) ? notes : []).flatMap((note) => {
    const thing = noteToTripThing(note);
    const sourceRef = thing?.metadata?.sourceRef;
    const id = String(sourceRef?.id || '').trim();
    const name = String(thing?.title || '').trim();
    if (!id || !name) return [];
    return [{ name, title: name, sourceRef: { source: 'tavily', id } }];
  });
}

async function runCustomerChatWebResearch({
  customerTurn = '',
  env = process.env,
  fetchImpl = globalThis.fetch,
  tavilyImpl = searchTavily,
} = {}) {
  if (!isCustomerWebResearchTurn(customerTurn)) return { status: 'skip' };
  const providerEnv = buildProviderEnv(env);
  if (!providerEnv.tavily) {
    const error = `Search refused to run. Missing ${providerEnv.tavilyName}.`;
    console.error(`customer chat web research refused: ${error}`);
    return { status: 'failed', error, webResults: [], things: [] };
  }
  try {
    const found = await tavilyImpl(customerTurn, { env: providerEnv, fetchImpl });
    const notes = (found?.results || []).map((row) => ({
      source: 'tavily',
      title: row.title,
      category: 'decision',
      url: row.url,
      description: row.content || '',
      externalId: row.url,
    }));
    if (!notes.length) {
      const error = 'Web research returned no sourced results.';
      console.error(`customer chat web research failed: ${error}`);
      return { status: 'failed', error, webResults: [], things: [], search: found };
    }
    const things = notes.map((note) => noteToTripThing(note));
    const webResults = webResultsToChatRows(notes);
    return { status: 'ok', error: null, things, webResults, search: found };
  } catch (error) {
    const message = String(error?.message || error || 'web research failed').trim();
    console.error(`customer chat web research failed: ${message}`);
    return { status: 'failed', error: message, webResults: [], things: [] };
  }
}

export async function applyChatWebResearchForVacationTurn({
  db,
  tripId,
  requestId,
  customerTurn,
  payload,
  customerLive,
  turnId,
  env = process.env,
  fetchImpl = globalThis.fetch,
  tavilyImpl,
} = {}) {
  const webResearchTurn = isCustomerWebResearchTurn(customerTurn);
  if (!webResearchTurn) return { kind: 'skip', webResults: [], webResearchTurn: false };
  const chatSearch = await runCustomerChatWebResearch({ customerTurn, env, fetchImpl, tavilyImpl });
  if (chatSearch.status === 'failed') {
    const webSearch = { status: 'failed', error: chatSearch.error };
    payload.webSearch = webSearch;
    customerLive.webSearch = webSearch;
    await db`
      update transcript_turns
      set payload = ${payload}
      where id = ${turnId}
    `;
    return { kind: 'failed', error: chatSearch.error, webSearch, webResearchTurn };
  }
  for (const thing of chatSearch.things) {
    await insertTripThing(db, { tripId, requestId, thing });
  }
  const webSearch = inTurnSearchTelemetry(chatSearch.things);
  payload.webSearch = webSearch;
  customerLive.webSearch = webSearch;
  await db`
    update transcript_turns
    set payload = ${payload}
    where id = ${turnId}
  `;
  return { kind: 'ok', webResults: chatSearch.webResults, webSearch, webResearchTurn };
}
