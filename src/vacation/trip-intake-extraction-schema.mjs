const TURN_KIND_TRIP_INTAKE = ['trip', 'intake'].join('_');

export function tripIntakeExtractionJsonSchema() {
  return {
    type: 'json_schema',
    json_schema: {
      name: 'trip_intake_extraction',
      strict: true,
      schema: {
        type: 'object',
        additionalProperties: false,
        required: [
          'turnKind', 'target', 'anchor', 'anchorIsLodging', 'category', 'targetKind', 'question', 'things', 'roster',
          'inviteeName', 'inviteeEmail', 'destination', 'hasDates', 'startDate', 'endDate', 'title',
        ],
        properties: {
          turnKind: {
            type: 'string',
            enum: ['place_search', 'web_research', TURN_KIND_TRIP_INTAKE, 'other'],
          },
          target: { type: 'string' },
          anchor: { type: 'string' },
          anchorIsLodging: { type: 'boolean' },
          category: { type: 'string' },
          targetKind: { type: 'string', enum: ['named_place', 'category', ''] },
          question: { type: 'string' },
          things: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['name', 'kind', 'who', 'when'],
              properties: {
                name: { type: 'string' },
                kind: { type: 'string' },
                who: { type: 'string' },
                when: { type: 'string' },
              },
            },
          },
          roster: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['name', 'role', 'age'],
              properties: {
                name: { type: 'string' },
                role: { type: 'string' },
                age: { type: ['number', 'null'] },
              },
            },
          },
          inviteeName: { type: 'string' },
          inviteeEmail: { type: 'string' },
          destination: { type: 'string' },
          hasDates: { type: 'boolean' },
          startDate: { type: 'string' },
          endDate: { type: 'string' },
          title: { type: 'string' },
        },
      },
    },
  };
}
