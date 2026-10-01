import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  accessPosture,
  applyJudgeGrade,
  bannedWordHits,
  collaboratorSeesOwnerThread,
  countRealVacations,
  endsWithExactlyOneQuestion,
  generateOnboardingFixtures,
  gradeNoVacationDropdown,
  hasVoiceInvitation,
  internalWordHits,
  literalLeaks,
  LONG_VOICE_TEMPLATE,
  mulberry32,
  normalizeJudge,
  onboardingVerdict,
  precheckOnboardingRun,
  QUESTION_FIRST_TEXT,
  renderJudgePacketMarkdown,
  SHORT_TRIP_TEXT,
  stampBuildSha,
  welcomeBeforeFirstTurn,
} from '../.cursor/skills/verify-timesyncher-vacation/scripts/onboarding-welcome-precheck.mjs';
import {
  agreeThenReadWelcome,
  ensureCollaboratorPrice,
  ensureWelcomeDatabase,
  redactWelcomeSecrets,
  selfTestMissingWelcomeDatabase,
  WELCOME_ONBOARDING_TIMEOUT,
  WELCOME_VERCEL_TOKEN_MISSING,
} from '../.cursor/skills/verify-timesyncher-vacation/scripts/verify-welcome-after-intake.mjs';

const OLD_WELCOME = 'I can help you plan your trip. What destination do you have in mind for this vacation?';
const SHAPED = 'Hello niaabcdef. The trip site is https://example.test/shared/trip-abcdefghi/. People can see the site without signing in. Day by day, notes, photos, videos, stories, then a keepsake. Hold the mic and talk for a minute or two.';

function turns(welcome, customer = 'hello there', welcomeAt = '2026-10-01T00:00:00.000Z', customerAt = '2026-10-01T00:00:02.000Z') {
  return [
    { speaker: 'app', text: welcome, at: welcomeAt },
    { speaker: 'customer', text: customer, at: customerAt },
  ];
}

const cleanSources = [{ file: 'src/vacation/example.mjs', text: 'export const ready = true;\n' }];

function run(welcome, extra = {}) {
  return precheckOnboardingRun({
    trips: [{ id: 'f1', turns: turns(welcome) }],
    literals: ['zon-abcdef12'],
    sources: cleanSources,
    ...extra,
  });
}

const shaped = run(SHAPED);
assert.equal(shaped.ok, true, JSON.stringify(shaped.failures));
assert.equal(onboardingVerdict({ precheck: shaped, judge: { graded: false } }).result, 'FAIL');
assert.equal(onboardingVerdict({ precheck: shaped, judge: { graded: false } }).reason, 'ungraded');
assert.equal(onboardingVerdict({ precheck: shaped, judge: { graded: true, pass: true } }).result, 'PASS');
assert.equal(onboardingVerdict({ precheck: shaped, judge: { graded: true, pass: false } }).reason, 'judge');

const old = run(OLD_WELCOME);
assert.equal(old.ok, false);
assert.equal(old.failures.some((item) => item.code === 'voice_invitation'), true);
assert.equal(onboardingVerdict({ precheck: old, judge: { graded: true, pass: true } }).reason, 'precheck');

assert.equal(welcomeBeforeFirstTurn([{ speaker: 'customer', text: 'hi', at: '2026-10-01T00:00:02.000Z' }]).ok, false);
assert.equal(welcomeBeforeFirstTurn(turns(SHAPED, 'hi', '2026-10-01T00:00:05.000Z', '2026-10-01T00:00:05.000Z')).reason, 'timestamp');
assert.equal(welcomeBeforeFirstTurn(turns(SHAPED, 'hi', '2026-10-01T00:00:03.000Z', '2026-10-01T00:00:01.000Z')).ok, false);

for (const word of ['Thing', 'EULA', 'terms', 'seat', 'payment', 'reservation']) {
  const hit = run(`${SHAPED} ${word}`);
  assert.equal(hit.ok, false, word);
  assert.equal(hit.failures.some((item) => item.code === 'banned_word'), true, word);
}
assert.deepEqual(bannedWordHits('Hold the mic and talk about the day.'), []);
assert.equal(hasVoiceInvitation('Please record a voice note.'), true);
assert.equal(hasVoiceInvitation('Please record a voice-note.'), true);
assert.equal(hasVoiceInvitation(OLD_WELCOME), false);

const leaked = literalLeaks(['zon-abcdef12'], [{ file: 'src/vacation/example.mjs', text: 'const place = "zon-abcdef12";' }]);
assert.equal(leaked.length, 1);
assert.equal(literalLeaks(['zon-abcdef12'], cleanSources).length, 0);
assert.equal(literalLeaks(['short'], [{ file: 'a.mjs', text: 'short' }]).length, 0);

const first = generateOnboardingFixtures(mulberry32(1));
const second = generateOnboardingFixtures(mulberry32(2));
assert.notEqual(first.trips[0].values.destination, second.trips[0].values.destination);
assert.match(first.trips[0].values.destination, /^zon-[a-z0-9]{8,}$/);
assert.match(first.trips[0].text, new RegExp(first.trips[0].values.destination));
assert.match(first.trips[0].text, new RegExp(first.trips[0].values.collab1));
assert.equal(first.trips[0].text.includes('{destination}'), false);
assert.equal(first.trips[1].text, SHORT_TRIP_TEXT);
assert.equal(first.trips[2].text, QUESTION_FIRST_TEXT);
assert.match(LONG_VOICE_TEMPLATE, /\{destination\}/);
assert.match(LONG_VOICE_TEMPLATE, /\{anniversaryDate\}/);

const gradedFail = normalizeJudge({
  source: 'dialog_vacation_dialog_judge',
  answers: { response_ready: false, needs_repair: true, priority_coverage_status: 'missing_material' },
});
assert.equal(gradedFail.graded, true);
assert.equal(gradedFail.pass, false);
const gradedPass = normalizeJudge({
  response_ready: 'yes',
  needs_repair: 'no',
  priority_coverage_status: 'all_covered',
});
assert.equal(gradedPass.pass, true);
assert.equal(normalizeJudge({ graded: true, pass: false }).pass, false);
const nested = normalizeJudge({
  judge: {
    response_ready: false,
    needs_repair: true,
    priority_coverage_status: { choice: 'missing_material' },
  },
});
assert.equal(nested.graded, true);
assert.equal(nested.pass, false);
assert.equal(nested.coverage, 'missing_material');
assert.equal(normalizeJudge(null).graded, false);

const packet = applyJudgeGrade({
  precheck: old,
  fixtures: first,
  requirements: [{ id: 'app_voice_invite', audience: 'app_welcome', text: 'voice' }],
  timestamps: [{ id: 'f1', welcomeAt: '2026-10-01T00:00:00.000Z', firstCustomerAt: '2026-10-01T00:00:02.000Z', welcomeBeforeCustomer: true }],
  trips: [{ id: 'f1', turns: turns(OLD_WELCOME) }],
  screenshots: ['f1-welcome.png'],
}, gradedFail);
assert.equal(packet.result, 'FAIL');
assert.equal(packet.pass, false);
const markdown = renderJudgePacketMarkdown(packet);
assert.match(markdown, /Result: FAIL/);
assert.match(markdown, new RegExp(first.trips[0].values.destination));
assert.match(markdown, /app_voice_invite/);
assert.match(markdown, /I can help you plan your trip/);

const precheckSource = readFileSync(fileURLToPath(new URL('../.cursor/skills/verify-timesyncher-vacation/scripts/onboarding-welcome-precheck.mjs', import.meta.url)), 'utf8');
assert.equal(precheckSource.includes(OLD_WELCOME), false);

const previous = process.env.DATABASE_URL;
delete process.env.DATABASE_URL;
try {
  let called = false;
  await ensureWelcomeDatabase({
    env: { DATABASE_URL: 'preset-welcome-db' },
    fetchImpl: async () => {
      called = true;
      throw new Error('fetch should not run');
    },
  });
  assert.equal(called, false);
  await assert.rejects(
    () => ensureWelcomeDatabase({ env: {}, fetchImpl: async () => { throw new Error('hidden'); } }),
    (error) => error.message === WELCOME_VERCEL_TOKEN_MISSING,
  );
} finally {
  if (previous === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = previous;
}

const redacted = redactWelcomeSecrets('connect postgres://user:secret@host/db failed', 'postgres://user:secret@host/db');
assert.equal(redacted.includes('postgres://'), false);
assert.equal(redacted.includes('[redacted]'), true);

const steps = [];
const welcome = await agreeThenReadWelcome({
  async fill(selector) { steps.push(['fill', selector]); },
  async check(selector) { steps.push(['check', selector]); },
  async click(selector) { steps.push(['click', selector]); },
  async waitFor(selector) { steps.push(['wait', selector]); return true; },
  async readWelcome() { steps.push(['assert']); return { shown: true, prior: ['Hello'] }; },
});
assert.deepEqual(steps, [
  ['fill', '#eulaName'],
  ['check', '#eulaAgree'],
  ['click', '#eulaAgreeButton'],
  ['wait', '#messages[data-screen="onboarding"]'],
  ['assert'],
]);
assert.equal(welcome.shown, true);

await assert.rejects(
  () => agreeThenReadWelcome({
    async fill() {},
    async check() {},
    async click() {},
    async waitFor() { throw new Error('https://example.test/session-secret-token'); },
    async readWelcome() { return { shown: true, prior: [] }; },
  }),
  (error) => error.message === WELCOME_ONBOARDING_TIMEOUT && !String(error.stack || '').includes('session-secret'),
);

const priceKey = 'TIMESYNCHER_COLLABORATOR_SINGLE_PRICE_CENTS';
const priorPrice = process.env[priceKey];
delete process.env[priceKey];
try {
  let calls = 0;
  await ensureCollaboratorPrice({
    env: { VERCEL_TOKEN: 'unit-token', [priceKey]: 'already-set' },
    fetchImpl: async () => { calls += 1; return { ok: false }; },
  });
  assert.equal(calls, 0);
  await ensureCollaboratorPrice({
    env: { VERCEL_TOKEN: 'unit-token' },
    fetchImpl: async () => ({ ok: true, json: async () => ({ key: 'OTHER', value: 'sentinel-price-value' }) }),
  });
  assert.equal(process.env[priceKey], undefined);
  const loaded = { VERCEL_TOKEN: 'unit-token' };
  await ensureCollaboratorPrice({
    env: loaded,
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({ key: priceKey, value: 'sentinel-price-value' }),
    }),
  });
  assert.equal(loaded[priceKey], 'sentinel-price-value');
  assert.equal(process.env[priceKey], 'sentinel-price-value');
} finally {
  if (priorPrice === undefined) delete process.env[priceKey];
  else process.env[priceKey] = priorPrice;
}

selfTestMissingWelcomeDatabase();

assert.deepEqual(internalWordHits('The tier and the route use a model named Jev.'), ['tier', 'route', 'model', 'jev']);
assert.deepEqual(internalWordHits('Hold the mic and talk about the day.'), []);
assert.equal(endsWithExactlyOneQuestion('The days are in. What should we decide first?'), true);
assert.equal(endsWithExactlyOneQuestion('What day? And who is coming?'), false);
assert.equal(endsWithExactlyOneQuestion('The days are in.'), false);
assert.equal(accessPosture('Anyone with the link can see the plans without signing in.').offered, true);
assert.equal(accessPosture('Anyone with the link can see the plans without signing in.').granted, false);
assert.equal(accessPosture('I have added him. Access granted.').granted, true);
const ownThread = collaboratorSeesOwnerThread(
  [{ speaker: 'customer', text: 'we are going to zon-abcdef12 for several nights together' }],
  [{ speaker: 'customer', text: 'we are going to zon-abcdef12 for several nights together' }],
);
assert.equal(ownThread.length, 1);
assert.match(ownThread[0], /zon-abcdef12/);
assert.deepEqual(collaboratorSeesOwnerThread(
  [{ speaker: 'customer', text: 'we are going to zon-abcdef12 for several nights together' }],
  [{ speaker: 'app', text: 'we are going to zon-abcdef12 for several nights together' }],
), []);
assert.equal(countRealVacations([{ destination: '', status: 'onboarding' }, { destination: 'zon-abcdef12' }]), 1);
assert.equal(gradeNoVacationDropdown({ vacationCount: 0, opened: true, selected: '', options: [] }).ok, true);
const listed = gradeNoVacationDropdown({
  vacationCount: 0,
  opened: true,
  selected: 'Area / Sample',
  options: ['Other / Sample'],
});
assert.equal(listed.ok, false);
assert.equal(listed.failures.some((item) => item.code === 'dropdown_preselected'), true);
assert.equal(listed.failures.some((item) => item.code === 'dropdown_options'), true);
assert.equal(gradeNoVacationDropdown({ vacationCount: 0, opened: false, selected: '', options: [] }).failures.some((item) => item.code === 'dropdown_not_opened'), true);
const unknownBuild = stampBuildSha({
  checkedAt: '2026-10-01T17:00:00.000Z',
  checked: [{ target: 'https://vacation-staging.timesyncher.com/api/version', sha: '' }],
});
assert.equal(unknownBuild.sha, 'UNKNOWN');
assert.equal(unknownBuild.known, false);
assert.equal(unknownBuild.checked[0].target.includes('/api/version'), true);
const knownBuild = stampBuildSha({ checked: [{ sha: 'bcccb56b201b554f0ca0771d3ee3796c74e05e0c' }] });
assert.equal(knownBuild.sha, 'bcccb56b201b554f0ca0771d3ee3796c74e05e0c');
assert.equal(knownBuild.known, true);

const dialog = precheckOnboardingRun({
  trips: [
    { id: 'f1', turns: [...turns(SHAPED), { speaker: 'app', text: 'I heard the voice note. What should we decide first?', at: '2026-10-01T00:00:04.000Z' }] },
    { id: 'f2', turns: turns(SHAPED) },
    { id: 'f3', turns: [...turns(SHAPED, QUESTION_FIRST_TEXT), { speaker: 'app', text: 'Yes. Anyone with the link can see the plans without signing in. I can add him.', at: '2026-10-01T00:00:04.000Z' }] },
  ],
  literals: ['zon-abcdef12'],
  sources: cleanSources,
  collaborator: { turns: [{ speaker: 'app', text: 'Hello. Hold the mic and talk.', at: '2026-10-01T00:00:03.000Z' }], userTexts: [] },
  noVacation: { vacationCount: 0, opened: true, selected: '', options: [] },
  eulaAccepts: [{ id: 'f1', at: '2026-10-01T00:00:00.000Z' }],
  checkDialog: true,
});
assert.equal(dialog.ok, true, JSON.stringify(dialog.failures));
const dialogFail = precheckOnboardingRun({
  trips: [{
    id: 'f1',
    turns: [...turns(`${SHAPED} The model is Jev.`), { speaker: 'app', text: 'What day? And who?', at: '2026-10-01T00:00:04.000Z' }],
  }, {
    id: 'f3',
    turns: [...turns(SHAPED), { speaker: 'app', text: 'I have added him. Access granted.', at: '2026-10-01T00:00:04.000Z' }],
  }],
  literals: ['zon-abcdef12'],
  sources: cleanSources,
  collaborator: {
    turns: [{ speaker: 'customer', text: first.trips[0].text, at: '2026-10-01T00:00:03.000Z' }],
    userTexts: [],
  },
  noVacation: { vacationCount: 1, opened: false, selected: 'Area / Sample', options: ['Other / Sample'] },
  eulaAccepts: [{ id: 'f1', at: null }],
  checkDialog: true,
});
assert.equal(dialogFail.ok, false);
for (const code of ['internal_word', 'f1_one_question', 'access_granted', 'vacation_count', 'dropdown_not_opened', 'eula_accept_time']) {
  assert.equal(dialogFail.failures.some((item) => item.code === code), true, code);
}
assert.match(first.emptyAccount.email, /^empty-/);
assert.match(first.emptyAccount.title, /^shell-/);

process.stdout.write('onboarding welcome precheck passed\n');
