import { DEFAULT_JEV_DECISIONS_URL, JEV_QUALITY_MODEL, jevPrecall } from '../../scripts/vacation-app-reply-rules.mjs';
import { splitCustomerSentences } from './customer-intent.mjs';
import { CONTENT_TAGS } from './turn-tags.mjs';

function structuredObject(properties) {
  return { type: 'object', additionalProperties: false, required: Object.keys(properties), properties };
}

export function turnUnderstandingRequest(request, message) {
  const format = request.response_format.json_schema;
  const boolean = { type: 'boolean' };
  const string = { type: 'string' };
  const sentences = splitCustomerSentences(message);
  const additional = {
    intent: structuredObject({
      asksPrice: boolean, asksAccess: boolean, pullsAccess: boolean, ask: boolean,
      seats: { type: 'array', items: structuredObject({ name: string, payer: string }) },
    }),
    contentTags: structuredObject({ tags: { type: 'array', items: { type: 'string', enum: CONTENT_TAGS } }, ask: boolean }),
    committedSentenceIndexes: { type: 'array', items: { type: 'integer' } },
  };
  format.name = 'vacation_turn_understanding';
  format.schema = structuredObject({ ...format.schema.properties, ...additional });
  request.prompt_cache_key = 'timesyncher-vacation-understanding';
  request.messages = [
    {
      role: 'system',
      content: [
        request.messages[0].content,
        'Return the fields above and all the additional fields defined in the supplied JSON schema.',
        'The input lists one customer turn as ordered sentences. Read them together for the extraction. For destination, report the trip location in the customer’s words only when they name it. Distinguish where they are going or staying from where they are leaving and from a venue or search anchor. Leave destination empty when they did not name a trip location.',
        'For intent, asksPrice, asksAccess, and pullsAccess are true only when the customer asks that. seats lists people whose requested access or price has an identified payer. Leave seats empty when there is no such request. ask is true when you cannot tell.',
        'For contentTags, choose only applicable tags from the schema. Use an empty list and ask true when none apply.',
        'For committedSentenceIndexes, list zero-based sentence indexes only when that sentence puts an activity on the plan. Leave out requests for suggestions, possibilities, and questions that do not commit to an activity.',
      ].join('\n'),
    },
    { role: 'user', content: JSON.stringify({ sentences }) },
  ];
  return request;
}

export async function turnIntakePrecheck({ turnSession, apiKey, model, env, fetchImpl, customerTurn }) {
  if (!turnSession || apiKey != null || model !== JEV_QUALITY_MODEL) return null;
  const url = String(env.TIMESYNCHER_JEV_CLASSIFY_URL || '').trim();
  if (url && url !== DEFAULT_JEV_DECISIONS_URL) return null;
  const started = Date.now();
  const { tripIntakeAnswer, ...jev } = await jevPrecall({
    customerTurn, stage: 'vacation_conversation', screen: 'vacation-app',
    session: { seed_id: turnSession.token || null }, includeTripIntake: true, env, fetchImpl,
  });
  return { turnJev: { ...jev, jevLatencyMs: Date.now() - started }, tripIntakeAnswer };
}
