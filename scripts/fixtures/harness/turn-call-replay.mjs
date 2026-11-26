import assert from 'node:assert/strict';
import { queueVacationAppTurnForTests } from '../../../routes/vacation-itinerary.mjs';
import { DEFAULT_JEV_DECISIONS_URL, openRouterChatVisibleText } from '../../vacation-app-reply-rules.mjs';
import { useVacationDatabase } from '../../../src/vacation/db.mjs';

export const HAIKU_PRICING = {
  prompt: '0.00000010',
  completion: '0.00000050',
  input_cache_read: '0.00000001',
};

export async function withMockedTurnPipeline(run, { destination = 'Bend', owner = 'Avery', start = '2027-03-04', end = '2027-03-08' } = {}) {
  const trip = { id: '10000000-0000-4000-8000-000000001149', title: `${destination} vacation`, destination, start_date: start, end_date: end, metadata: { publicSlug: 'fixture-1149' } };
  const session = { customer_id: 'fixture-owner', first_name: owner, display_name: owner, metadata: { replyBackend: 'openrouter' } };
  const stored = [];
  const activityUpdates = [];
  const captured = [];
  const unexpected = [];
  let current;
  let index = 0;
  const db = async (strings, ...values) => {
    const query = strings.join(' ? ').replace(/\s+/g, ' ').trim();
    if (/select count\(\*\)::int as n.*from transcript_turns/i.test(query)) return [{ n: stored.length }];
    if (/select speaker, body, payload.*from transcript_turns/i.test(query)) return [...stored].reverse();
    if (/insert into vacation_requests/i.test(query)) return [{ id: `request-${stored.length + 1}` }];
    if (/insert into transcript_turns/i.test(query)) {
      const speaker = /'customer'/.test(query) ? 'customer' : 'app';
      stored.push({ speaker, body: values[3], payload: structuredClone(values[4]) });
      return [{ id: `turn-${stored.length}` }];
    }
    if (/insert into trip_things/i.test(query)) return [{ id: 'fixture-thing' }];
    if (/insert into worker_jobs/i.test(query)) return [{ id: `job-${stored.length}` }];
    if (/select e.plan, e.status, e.metadata, e.trip_id/i.test(query)) return [{ plan: 'single', status: 'active', trip_id: trip.id, metadata: {} }];
    if (query.startsWith('select count(*)::int as n from trip_things')) return [{ n: current?.thing ? 1 : 0 }];
    if (/select id, category, title, description, metadata, location from trip_things/i.test(query)) {
      return current?.thing ? [current.thing] : [];
    }
    if (/^update trip_things set description = ''/i.test(query)) {
      activityUpdates.push(values[1]);
      return [{ id: current.thing.id }];
    }
    if (query.startsWith('select') && /from trips where id/i.test(query)) {
      return current?.noSavedDestination ? [{ ...trip, destination: '' }] : [trip];
    }
    return [];
  };
  const env = {
    OPENROUTER_API_KEY: 'test-key',
    TIMESYNCHER_JEV_CLASSIFY_URL: DEFAULT_JEV_DECISIONS_URL,
    TIMESYNCHER_GBRAIN_GET_PAGE_URL: 'https://rules.example.test/page',
    TIMESYNCHER_ORDER_BUMP_PRICE_CENTS: '1900',
    TIMESYNCHER_SINGLE_NAME: 'TimeSyncher Vacation Single',
    TIMESYNCHER_TRAVEL_BASE_URL: 'https://travel.example.test',
    CHAT_ITINERARY_EDIT_OFFLINE_PARSE: '1',
  };
  const originalFetch = globalThis.fetch;
  const originalEnv = process.env;
  process.env = { ...env };
  useVacationDatabase(db);
  globalThis.fetch = async (url, init = {}) => {
    if (String(url) === env.TIMESYNCHER_GBRAIN_GET_PAGE_URL) {
      return Response.json({ frontmatter: { smoke_bar_phrase: 'Fixture rules loaded' } });
    }
    const route = new URL(url).pathname;
    const body = init.body ? JSON.parse(init.body) : {};
    if (route === '/api/v1/models') {
      return Response.json({ data: [{ id: 'anthropic/claude-haiku-5.5', pricing: HAIKU_PRICING }] });
    }
    if (route === '/api/alpha/decisions') {
      if (body.questions.route_type && body.questions.overall_quality) {
        captured.push({ purpose: 'jev_turn', body });
        const low = current.rewrite && body.state.draft === current.reply;
        return Response.json({
          answers: {
            route_type: { choice: 'general' },
            overall_quality: { score: low ? 0 : 3 },
            disposition: { choice: low ? 'rewrite' : 'keep' },
            fix_focus: { choice: low ? 'misses_ask' : 'keep' },
          },
        });
      }
      if (body.questions.overall_quality) {
        captured.push({ purpose: 'jev_quality', body });
        const low = current.rewrite && body.state.draft === current.reply;
        return Response.json({ answers: { overall_quality: { score: low ? 0 : 3 }, disposition: { choice: low ? 'rewrite' : 'keep' }, fix_focus: { choice: low ? 'misses_ask' : 'keep' } } });
      }
    }
    if (route === '/api/v1/chat/completions') {
      const system = openRouterChatVisibleText(body.messages.find((message) => message.role === 'system')?.content);
      const user = body.messages.find((message) => message.role === 'user')?.content;
      let purpose;
      let content;
      if (body.response_format?.json_schema?.name === 'vacation_turn_understanding') {
        purpose = 'turn_understanding';
        content = JSON.stringify({
          turnKind: current.intake ? 'trip_intake' : 'other', things: [], roster: [],
          target: '', anchor: '', anchorIsLodging: false, category: '', targetKind: '', question: '',
          inviteeName: '', inviteeEmail: '', destination, title: trip.title,
          hasDates: current.intake === true, startDate: current.intake ? start : '', endDate: current.intake ? end : '',
          intent: { asksPrice: false, asksAccess: false, pullsAccess: false, ask: false, seats: [], ...current.intent },
          contentTags: { tags: current.tags || [], ask: !current.tags?.length },
          committedSentenceIndexes: current.committedSentenceIndexes || [],
          ...current.extraction,
        });
      } else if (system.includes('"template":boolean')) {
        purpose = 'interim_judge';
        content = '{"template":false,"canShip":false}';
      } else if (system.includes('one or two sentence holding line')) {
        purpose = 'reply_interim';
        content = 'The rest of the day can stay open while we work through the details.';
      } else {
        purpose = user.includes('WHAT_I_CHANGED') ? 'reply_rewrite' : 'reply_draft';
        content = purpose === 'reply_rewrite' ? current.rewrite : current.reply;
      }
      if (content) {
        captured.push({ purpose, body });
        const usage = current.usage?.({ body, purpose, content, index }) || {
          prompt_tokens: 1000, completion_tokens: 100,
          prompt_tokens_details: { cached_tokens: index > 1 ? 512 : 0 },
          completion_tokens_details: { reasoning_tokens: 0 },
        };
        return Response.json({ model: body.model, usage, choices: [{ message: { content } }] });
      }
    }
    unexpected.push(route);
    throw new Error('Unexpected fetch in the turn replay');
  };
  try {
    await run({
      captured, stored, activityUpdates,
      send: async (sample) => {
        current = sample;
        index += 1;
        const result = await queueVacationAppTurnForTests(db, session, trip, { text: sample.text });
        assert.deepEqual(unexpected, []);
        assert.equal(result.ok, true, `Replay turn ${index} failed: ${result.error}`);
        return result;
      },
    });
  } finally {
    globalThis.fetch = originalFetch;
    process.env = originalEnv;
    useVacationDatabase(null);
  }
}

export const INTAKE_SAMPLE = {
  text: 'We are planning a short Bend stay from March 4 to March 8 2027. Keep the days light.',
  reply: 'Avery, I am building a light Bend vacation from March 4 to March 8, 2027. Who is coming with you?',
  intake: true,
  noSavedDestination: true,
};

export const FOLLOWUP_SAMPLE = {
  text: 'Thursday is a town walk.',
  reply: 'Thursday can stay open for a town walk. Leave time for breaks and keep the rest of the day flexible.',
  tags: ['activities_experiences'],
  committedSentenceIndexes: [0],
};
