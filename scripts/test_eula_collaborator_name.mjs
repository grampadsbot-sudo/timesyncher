import assert from 'node:assert/strict';

import { eulaCollaboratorPlanName, loadDefaultEulaText } from '../src/onboarding/eula-persistent-core.mjs';

assert.throws(() => eulaCollaboratorPlanName({}), /TIMESYNCHER_COLLABORATOR_NAME is missing/);

const env = { TIMESYNCHER_COLLABORATOR_NAME: 'Collaborator seat' };
assert.equal(eulaCollaboratorPlanName(env), 'Collaborator seat');
const text = loadDefaultEulaText(env);
assert.match(text, /Plan Collaborator seat lets the owner invite/);
assert.doesNotMatch(text, /telegram_collaborators_single_trip/);

console.log('eula collaborator name passed');
