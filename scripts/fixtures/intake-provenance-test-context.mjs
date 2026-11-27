export const INTAKE_PROVENANCE_TEST_TURN_ID = 'fixture-customer-turn';

export const INTAKE_PROVENANCE_TEST_CONTEXT = {
  customerTurns: {
    [INTAKE_PROVENANCE_TEST_TURN_ID]: {
      speaker: 'customer',
      text: 'We want North Market Hall for dinner Tuesday and Zephyr Pavilion for the hotel stay Tue Jun 9.',
    },
  },
};

export const INTAKE_PROVENANCE_TEST_OPTIONS = {
  customerTurnId: INTAKE_PROVENANCE_TEST_TURN_ID,
  provenanceContext: INTAKE_PROVENANCE_TEST_CONTEXT,
};

export function thingWithFixtureProvenance(item = {}) {
  const name = item.name || item.title || '';
  return {
    ...item,
    origin: item.origin || 'customer_turn',
    customerTurnId: item.customerTurnId || INTAKE_PROVENANCE_TEST_TURN_ID,
    customerSpan: item.customerSpan || name,
  };
}