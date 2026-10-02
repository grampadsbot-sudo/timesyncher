import { insertTripThing } from './trip-things.mjs';
import { noteToTripThing } from './place-search.mjs';
import { searchTavily } from './poi-search.mjs';
import { buildProviderEnv } from './provider-env.mjs';
import { inTurnSearchTelemetry } from './in-turn-search-telemetry.mjs';

function clean(value, max) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
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
  webResearchTurn = false,
  classification = null,
  env = process.env,
  fetchImpl = globalThis.fetch,
  tavilyImpl = searchTavily,
} = {}) {
  if (!webResearchTurn) return { status: 'skip' };
  const providerEnv = buildProviderEnv(env);
  if (!providerEnv.tavily) {
    const error = `Search refused to run. Missing ${providerEnv.tavilyName}.`;
    console.error(`customer chat web research refused: ${error}`);
    return { status: 'failed', error, webResults: [], things: [] };
  }
  const query = clean(classification?.question, 600) || clean(customerTurn, 600);
  try {
    const found = await tavilyImpl(query, { env: providerEnv, fetchImpl });
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
  classification,
  webResearchTurn = false,
  payload,
  customerLive,
  turnId,
  env = process.env,
  fetchImpl = globalThis.fetch,
  tavilyImpl,
} = {}) {
  if (!webResearchTurn) return { kind: 'skip', webResults: [], webResearchTurn: false };
  const chatSearch = await runCustomerChatWebResearch({
    customerTurn,
    webResearchTurn,
    classification,
    env,
    fetchImpl,
    tavilyImpl,
  });
  const classifierMeta = {
    turnKind: classification?.turnKind || 'web_research',
    classifierModel: classification?.routerModel || null,
  };
  if (chatSearch.status === 'failed') {
    const webSearch = { status: 'failed', error: chatSearch.error, ...classifierMeta };
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
  const webSearch = {
    ...inTurnSearchTelemetry(chatSearch.things),
    ...classifierMeta,
  };
  payload.webSearch = webSearch;
  customerLive.webSearch = webSearch;
  await db`
    update transcript_turns
    set payload = ${payload}
    where id = ${turnId}
  `;
  return { kind: 'ok', webResults: chatSearch.webResults, webSearch, webResearchTurn };
}
