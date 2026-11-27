import { splitCustomerSentences } from './customer-intent.mjs';
import { CONTENT_TAGS } from './turn-tags.mjs';

function structuredObject(properties) {
  return { type: 'object', additionalProperties: false, required: Object.keys(properties), properties };
}

export function turnUnderstandingRequest(request, message, includePlanningInputs = false) {
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
    sendCollaboratorInvite: { anyOf: [
      { type: 'null' },
      structuredObject({ name: string, email: string, explicitSendRequestSpan: string }),
    ] },
  };
  if (includePlanningInputs) {
    additional.planningParty = string;
    additional.planningWants = {
      type: 'array', items: structuredObject({
        category: { type: 'string', enum: ['restaurant', 'bar', 'event', 'park', 'hotel', 'other'] },
        value: string,
      }),
    };
  }
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
        'For intent, asksPrice, asksAccess, and pullsAccess are true only when the customer asks that. In seats, list people from an access or price request when the customer identifies who covers the cost. Otherwise leave seats empty. ask is true when you cannot tell.',
        'For contentTags, choose only applicable tags from the schema. Use an empty list and ask true when none apply.',
        'For committedSentenceIndexes, list zero-based sentence indexes only when that sentence puts an activity on the plan. Leave out requests for suggestions, possibilities, and questions that do not commit to an activity.',
        ...(includePlanningInputs ? [
          'For planningParty, quote the stated vacation party, including unnamed people, group size, or traveling alone. Return an empty string when the turn does not say who is traveling.',
          'For planningWants, quote desired dining, nightlife, events, attractions, lodging, and other vacation interests from this turn. Use park for attractions and activities. Include general interests even if no venue is named. Use an empty list if the turn states no preferences or wants. Exclude rejected options and existing reservations.',
          'Use thing kinds bar and event for named bars and events. Put general preferences only in planningWants.',
        ] : []),
      ].join('\n'),
    },
    { role: 'user', content: JSON.stringify({ sentences }) },
  ];
  return request;
}
