const TIME_SCHEMA = {
  type: ['object', 'null'],
  properties: {
    value: { type: 'string' },
    precision: { type: 'string', enum: ['window', 'approximate', 'exact', 'proposed'] },
  },
  required: ['value', 'precision'],
  additionalProperties: false,
};

const ROLE_ENUM = ['visit', 'check_in', 'check_out', 'leg', 'ride'];

const ACTION_TOOL_SPECS = {
  place_on_day: {
    description: 'Assign or move a saved item onto a trip day with an optional time or order anchor.',
    properties: {
      item: { type: 'string' },
      day: { type: 'string' },
      role: { type: 'string', enum: ROLE_ENUM },
      time: TIME_SCHEMA,
      time_evidence: { type: ['string', 'null'] },
      before: { type: ['string', 'null'] },
      move: { type: ['string', 'null'] },
      occurrence: { type: ['string', 'null'] },
    },
  },
  add_from_search: {
    description: 'Promote a verified search candidate into the trip and optionally place it on a day.',
    properties: {
      candidate: { type: 'string' },
      day: { type: ['string', 'null'] },
      role: { type: 'string', enum: ROLE_ENUM },
      replace_hotel: { type: ['string', 'null'] },
      time: TIME_SCHEMA,
      time_evidence: { type: ['string', 'null'] },
    },
  },
  add_named_item: {
    description: 'Create or upsert a customer-named place, placeholder, or plan block.',
    properties: {
      type: { type: 'string', enum: ['hotel', 'park', 'activity', 'meal', 'restaurant', 'flight_option', 'ground_ride', 'other'] },
      label: { type: 'string' },
      evidence: { type: 'string' },
      details: { type: ['object', 'null'] },
    },
  },
  set_stay: {
    description: 'Set hotel check-in and check-out days and optional windows.',
    properties: {
      hotel: { type: 'string' },
      check_in: { type: 'string' },
      check_out: { type: 'string' },
      check_in_time: { type: ['object', 'null'] },
      check_out_time: { type: ['object', 'null'] },
      check_in_evidence: { type: ['string', 'null'] },
      check_out_evidence: { type: ['string', 'null'] },
    },
  },
  save_plan: {
    description: 'Apply an ordered batch of up to 32 item, stay, and day placement operations.',
    properties: {
      authority: { type: 'string' },
      operations: {
        type: 'array',
        minItems: 1,
        maxItems: 32,
        items: {
          type: 'object',
          properties: {
            op: { type: 'string', enum: ['add_named_item', 'add_from_search', 'place_on_day', 'set_stay', 'set_time'] },
            args: { type: 'object' },
            as: { type: 'string' },
          },
          required: ['op', 'args'],
          additionalProperties: false,
        },
      },
    },
  },
  hold_invite: {
    description: 'Record an explicit customer access-grant request without sending an email invite.',
    properties: {
      name: { type: 'string' },
      access: { type: 'string', enum: ['view', 'edit', 'collaborator'] },
    },
  },
  set_time: {
    description: 'Set a time on an existing item placement.',
    properties: {
      item: { type: 'string' },
      day: { type: 'string' },
      role: { type: 'string', enum: ROLE_ENUM },
      time: { type: 'object' },
      time_evidence: { type: ['string', 'null'] },
      move: { type: ['string', 'null'] },
    },
  },
  add_bar_before: {
    description: 'Place an eligible saved bar before a timed anchor on a day.',
    properties: { anchor: { type: 'string' }, day: { type: 'string' } },
  },
  undo: {
    description: 'Revert a supported logged edit.',
    properties: { edit_id: { type: 'string' } },
  },
  search_places: {
    description: 'Search approved place providers for candidates without mutating the itinerary.',
    properties: { area: { type: 'string' }, category: { type: 'string' }, criteria: { type: ['string', 'object'] } },
  },
  invite_collaborator: {
    description: 'Send an explicit collaborator access invitation.',
    properties: {
      name: { type: 'string' },
      email: { type: 'string' },
      access: { type: 'string', enum: ['view', 'edit', 'collaborator'] },
      send_request: { type: 'boolean' },
    },
  },
};

export function enabledTripStateTools(capabilities) {
  const actions = capabilities?.actions && typeof capabilities.actions === 'object' ? capabilities.actions : {};
  const tools = [];
  for (const name of Object.keys(actions).sort()) {
    const cap = actions[name];
    if (cap?.enabled !== true) continue;
    const spec = ACTION_TOOL_SPECS[name];
    if (!spec) continue;
    tools.push({
      type: 'function',
      function: {
        name,
        description: spec.description,
        parameters: {
          type: 'object',
          additionalProperties: false,
          properties: spec.properties,
          required: Array.isArray(cap.requires) ? [...cap.requires] : [],
        },
      },
    });
  }
  return tools;
}
