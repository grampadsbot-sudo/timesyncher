import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  isoDateFromStartsAt,
  d1StartsOnDate,
  attributeDThingRows,
  gradeDExtraRows,
  turnTextRequestsThing,
  matchCollaboratorWelcome,
  a2WelcomePass,
  gradeMapBar,
  mapWithinMaui,
  replayDGradesFromSaved,
  replayA2FromSaved,
  collaboratorWelcomeTemplatePrefix,
  welcomeTranscriptTurnsForClaims,
  gradeLogoChipRow,
  gradeLogoTabResult,
  attributeLogoMisalignmentCss,
  objectFitContentBox,
  gradeAskLodging,
  gradeCoffeeReplyRows,
  gradeD2UnschedReply,
  gradeAskD2Reply,
  parseJevNoulAnswer,
  jevBlockFromResult,
  persistedLodgingAskSignals,
  isRealBrandLogoSrc,
  gradeSharedTabLogoUrlRecords,
  gradeCarTabRowIcons,
} from './shepherd-staging-smoke-lib.mjs';
import {
  classifySmokeServerTiming,
  serverTimingFromItineraryJson,
  smokeProviderTimingsReport,
} from './shepherd-staging-smoke-helpers.mjs';
import {
  APP_MAP_READY_FAIL_MS,
  SHARED_GOTO_TIMEOUT_MS,
  SHARED_MAP_READY_WAIT_MS,
  gotoAndHydrateSharedIntakePage,
  listSharedDomTabs,
} from './shepherd-staging-smoke-shared-ui-map.mjs';
import {
  createLogoStageTimestamps,
  pickSlowLogoStage,
  LOGO_TAB_SETTLE_MS,
  LOGO_IMG_LOAD_CAP_MS,
  LOGO_VIEWPORT_WIDTHS,
  LOGO_ROW_SCREENSHOT_CAP,
} from './shepherd-staging-smoke-logo-metrics.mjs';

assert.equal(APP_MAP_READY_FAIL_MS, 10000);
assert.equal(SHARED_GOTO_TIMEOUT_MS, 60000);
assert.equal(SHARED_MAP_READY_WAIT_MS, 45000);
assert.equal(typeof gotoAndHydrateSharedIntakePage, 'function');
assert.equal(typeof listSharedDomTabs, 'function');
assert.equal(typeof createLogoStageTimestamps, 'function');
assert.equal(typeof pickSlowLogoStage, 'function');
assert.equal(LOGO_TAB_SETTLE_MS, 400);
assert.equal(LOGO_IMG_LOAD_CAP_MS, 5000);
assert.deepEqual(LOGO_VIEWPORT_WIDTHS, [1280, 390]);
assert.equal(LOGO_ROW_SCREENSHOT_CAP, 8);
const emptyStages = createLogoStageTimestamps();
assert.equal(pickSlowLogoStage(emptyStages), null);

assert.equal(classifySmokeServerTiming({ latencyMs: 5000, sessionE2eMs: 4000 }).slowThresholdMs, 10000);
assert.equal(classifySmokeServerTiming({ latencyMs: 5000, sessionE2eMs: 4000 }).appFail, false);
assert.equal(classifySmokeServerTiming({ latencyMs: 11000, sessionE2eMs: 4000 }).appFail, true);
const st5 = serverTimingFromItineraryJson({
  serverTiming: {
    latencyMs: 2913,
    sessionE2eMs: 8165,
    stages: { postMs: 4000, queueTurnMs: 3000, classifierMs: 1200 },
  },
});
assert.equal(st5.latencyMs, 2913);
assert.equal(st5.sessionE2eMs, 8165);
assert.deepEqual(st5.stages, { postMs: 4000, queueTurnMs: 3000, classifierMs: 1200 });
assert.equal(smokeProviderTimingsReport({ placeSearch: { providerTimings: { braveMs: 1 } } }).braveMs, 1);
assert.equal(smokeProviderTimingsReport({}), 'absent');
assert.equal(isoDateFromStartsAt('2027-03-13T12:00:00.000Z'), '2027-03-13');
assert.equal(isoDateFromStartsAt('Sat Mar 13 2027 12:00:00 GMT+0000'), '2027-03-13');
assert.equal(d1StartsOnDate(new Date('2027-03-13T12:00:00.000Z')), true);
assert.equal(String(new Date('2027-03-13T12:00:00.000Z')).slice(0, 10) !== '2027-03-13', true);

const d1Turn = 'aaf6661e-f051-4138-b98c-427d00e3bcca';
const d2Turn = '757223c8-e4f6-42ea-b635-7a5e7d3557d0';
const things = [
  { id: '0b2e8470-677f-4696-b433-6447d808d27f', title: "Mama's Fish House", source: null, metadata: {} },
  { id: 'fa61c527-babb-43d4-877d-0100eb6ce187', title: 'Paia Fish Market Restaurant', source: 'brave', metadata: { source_request_id: 'req-d2' } },
];
const customerTurns = [
  { id: '8073a532-6065-474c-8878-bf79ffe62531', body: 'Maui March 10-17 2027 with my wife', request_id: null },
  { id: d1Turn, body: "add Mama's Fish House for Saturday", request_id: 'req-d1' },
  { id: d2Turn, body: 'save Paia Fish Market', request_id: 'req-d2' },
];
const attributed = attributeDThingRows({
  things,
  customerTurns,
  turnResponses: [
    { turnId: d1Turn, json: { thingId: things[0].id, sharedDayIds: [121470508] } },
    { turnId: d2Turn, json: {} },
  ],
});
assert.equal(attributed[0].creatingTurnId, d1Turn);
assert.equal(attributed[1].creatingTurnId, d2Turn);
assert.equal(attributed[1].creatingTurnText?.toLowerCase().includes('paia'), true);
assert.deepEqual(gradeDExtraRows(attributed), []);

let saved;
try {
  saved = JSON.parse(readFileSync('/tmp/shepherd-964b88b-out.json', 'utf8'));
} catch {
  saved = null;
}
if (saved?.checkD) {
  const replay = replayDGradesFromSaved(saved.checkD);
  console.log(JSON.stringify({
    fixture: 'saved-964b88b-out',
    d1DateOk: replay.d1DateOk,
    iso: replay.iso,
    legacyStartsAt: replay.legacyStartsAt,
    legacyDateBug: replay.legacyDateBug,
    legacyWrongPaia: replay.legacyWrongPaia,
    failures: replay.failures,
    attributedSample: replay.attributed.slice(0, 2),
  }, null, 2));
  assert.equal(replay.d1DateOk, true);
  assert.equal(replay.iso, '2027-03-13');
  assert.equal(replay.legacyDateBug, true);
  assert.ok(replay.legacyWrongPaia >= 1);
}

if (saved?.checkA2) {
  const a2Replay = replayA2FromSaved(saved.checkA2, 'Spouse964');
  const syntheticTurn = {
    id: 'welcome-turn-synth',
    speaker: 'app',
    body: 'Hi Spouse964, welcome! Owner964 added you to Maui March 10-17 2027 with my wife. Here is the trip website: https://vacation-staging.timesyncher.com/shared/x/',
    payload: { welcomeAudience: 'collaborator', welcomeFor: a2Replay.welcomeFor },
  };
  const claims = saved.checkA2.welcomeDb || [];
  const linked = welcomeTranscriptTurnsForClaims({ welcomeRows: claims, transcriptTurns: [syntheticTurn] });
  assert.equal(linked.length, 1);
  const match = matchCollaboratorWelcome({
    welcomeRows: claims,
    transcriptTurns: [syntheticTurn],
    welcomeForCustomerId: a2Replay.welcomeFor,
    inviteeDisplayName: 'Spouse964',
  });
  console.log(JSON.stringify({
    fixture: 'saved-a2-welcome',
    welcomeFor: a2Replay.welcomeFor,
    emptyTranscriptFromRun71: (saved.checkA2.welcomeTurnsDb || []).length === 0,
    syntheticMatch: match,
    a2PassIfPublicUrl: a2WelcomePass(match, { redirectOk: true, publicUrlOk: true }),
  }, null, 2));
  assert.equal(match.welcomeTurnCount, 1);
  assert.equal(match.greetsInviteeCount, 1);
}

const prefix = collaboratorWelcomeTemplatePrefix();
const welcomeMatch = matchCollaboratorWelcome({
  welcomeRows: [{ welcome_for: 'cd351b2f-1dff-4681-b25b-0d107c05e194' }],
  transcriptTurns: [{
    id: 'turn-1',
    speaker: 'app',
    body: 'Hi Spouse964, welcome! Owner964 added you to Maui. Here is the trip website: https://vacation-staging.timesyncher.com/shared/intake-x/',
    payload: { welcomeAudience: 'collaborator', welcomeFor: 'cd351b2f-1dff-4681-b25b-0d107c05e194' },
  }],
  welcomeForCustomerId: 'cd351b2f-1dff-4681-b25b-0d107c05e194',
  inviteeDisplayName: 'Spouse964',
});
assert.equal(welcomeMatch.welcomeTurnCount, 1);
assert.equal(welcomeMatch.greetsInviteeCount, 1);
assert.ok(String(prefix).startsWith('Hi '));

const mapFail = gradeMapBar({ engine: 'mapbox', mounted: true, centerStatus: 'unverified', lat: null, lng: null, unresolved: false }, []);
assert.equal(mapFail.pass, false);
assert.equal(mapFail.centerStatus, 'unverified');
const mapPass = gradeMapBar({
  engine: 'leaflet',
  mounted: true,
  centerStatus: 'verified',
  lat: 20.75,
  lng: -156.4,
  unresolved: false,
}, []);
assert.equal(mapPass.pass, true);
assert.equal(mapWithinMaui({ lat: 20.75, lng: -156.4 }), true);
const mapSignals = gradeMapBar({
  engine: 'leaflet',
  mounted: true,
  centerStatus: 'verified',
  lat: 20.75,
  lng: -156.4,
  unresolved: false,
}, ['map_center_unresolved: trip-1']);
assert.equal(mapSignals.pass, false);
assert.ok(mapSignals.signals.length >= 1);

const fitBox = objectFitContentBox({
  boxLeft: 10,
  boxTop: 20,
  boxWidth: 22,
  boxHeight: 22,
  naturalWidth: 44,
  naturalHeight: 22,
  objectFit: 'contain',
});
assert.ok(fitBox);
assert.equal(fitBox.width, 22);
assert.equal(fitBox.height, 11);
assert.equal(Math.abs(fitBox.centerX - (10 + 11)), 0);
assert.equal(Math.abs(fitBox.centerY - (20 + 11)), 0);

const geoPass = gradeLogoChipRow({
  contentCenterDxPx: 1,
  contentCenterDyPx: 0.5,
  paddingAsymmetryPx: { left: 3, right: 3, top: 2, bottom: 2 },
  com: { dxPx: 1, dyPx: 1 },
});
assert.equal(geoPass.pass, true);

const geoFail = gradeLogoChipRow({
  contentCenterDxPx: 4,
  contentCenterDyPx: 0,
  paddingAsymmetryPx: { left: 1, right: 5, top: 2, bottom: 2 },
  com: { dxPx: 2, dyPx: 0.5 },
});
assert.equal(geoFail.pass, false);

const tabFail = gradeLogoTabResult({
  tab: 'hotels',
  clicked: true,
  rows: [],
  logoUrlEvidence: { ok: true, records: [{ hasLogoUrl: true }] },
});
assert.equal(tabFail.pass, false);
assert.equal(tabFail.failReason, 'zero_brand_imgs_with_real_src');

const logoUrlFail = gradeLogoTabResult({
  tab: 'hotels',
  clicked: true,
  rows: [{ isBrandImg: true, com: { dxPx: 0.5, dyPx: 0.5 } }],
  logoUrlEvidence: gradeSharedTabLogoUrlRecords({
    places: [{ id: 1, name: 'Westin', category_name: 'hotel' }],
    thingOverrides: { 'place:1': {} },
  }, 'hotels'),
});
assert.equal(logoUrlFail.pass, false);
assert.equal(logoUrlFail.logoUrlEvidence.missingLogoUrlCount, 1);

assert.equal(isRealBrandLogoSrc('https://cdn.example/logo.png'), true);
assert.equal(isRealBrandLogoSrc(''), false);
assert.equal(gradeCarTabRowIcons({ hasPlane: true, hasCar: true, rowCount: 1 }).pass, false);
assert.equal(gradeCarTabRowIcons({ hasPlane: false, hasCar: true, rowCount: 1 }).pass, true);

const suspects = attributeLogoMisalignmentCss({ liAlignItems: 'flex-start', imgMargin: '0px auto' });
assert.ok(suspects.some((s) => s.file.includes('trek-style2-bundle.mjs')));
assert.ok(suspects.some((s) => s.file === 'shared-app.html'));

const lodgingSignals = persistedLodgingAskSignals(
  { tripContext: { lodgingAsk: true, needsCustomerInput: ['lodging'] } },
  {},
);
assert.equal(lodgingSignals.persistedLodgingAsk, true);

const stubJevYes = async () => ({
  ok: true,
  error: null,
  verdict: 'yes',
  yes: true,
  rationale: 'stub-yes',
  model: 'test/jev-stub',
});
const stubJevNo = async () => ({
  ok: true,
  error: null,
  verdict: 'no',
  yes: false,
  rationale: 'stub-no',
  model: 'test/jev-stub',
});
const stubJevFail = async () => ({
  ok: false,
  error: 'stub-timeout',
  verdict: null,
  yes: null,
  rationale: '',
  model: 'test/jev-stub',
});

const c842D2Reply = "Paia Fish Market is on the list but not yet assigned to a specific day.";
const d2UnschedPass = await gradeD2UnschedReply(c842D2Reply, { judgeFn: stubJevYes });
assert.equal(d2UnschedPass.pass, true);
assert.equal(d2UnschedPass.jev.verdict, 'yes');
assert.equal(d2UnschedPass.jev.model, 'test/jev-stub');

const d2UnschedJevFail = await gradeD2UnschedReply(c842D2Reply, { judgeFn: stubJevFail });
assert.equal(d2UnschedJevFail.pass, false);
assert.match(String(d2UnschedJevFail.jev.error || ''), /stub-timeout/);

const askD2Pass = await gradeAskD2Reply(c842D2Reply, { judgeFn: stubJevNo });
assert.equal(askD2Pass.pass, true);

const askD2Fail = await gradeAskD2Reply('Where are you staying on Maui?', { judgeFn: stubJevYes });
assert.equal(askD2Fail.pass, false);

const lodgingPass = await gradeAskLodging({
  replyText: 'Where will you be staying during the trip?',
  payload: { tripContext: { lodgingAsk: true } },
  turnJson: {},
  hotelCount: 0,
  judgeFn: stubJevYes,
});
assert.equal(lodgingPass.pass, true);
assert.equal(lodgingPass.jev.verdict, 'yes');

assert.equal(parseJevNoulAnswer({ noul: 0.9 }).yes, true);
assert.equal(parseJevNoulAnswer({ noul: 0.1 }).yes, false);

const jevMeta = jevBlockFromResult({ verdict: 'yes', rationale: 'ok', score: 0.9, model: 'test-model' }, {
  questionKey: 'saved_not_on_day',
  customerTurn: 'save Paia Fish Market',
  replyExcerpt: 'Saved for later.',
});
assert.equal(jevMeta.questionKey, 'saved_not_on_day');
assert.equal(jevMeta.noul, 0.9);
assert.match(jevMeta.replyExcerpt, /Saved/);

const stubCoffeeJev = async () => ({
  ok: true,
  verdict: 'yes',
  yes: true,
  score: 0.95,
  rationale: 'noul=0.950',
  model: 'stub',
});
const coffeeGrade = await gradeCoffeeReplyRows([{ title: 'Maui Coffee Roasters' }], { judgeFn: stubCoffeeJev });
assert.equal(coffeeGrade.pass, true);
assert.equal(coffeeGrade.rows[0].jev.verdict, 'yes');

console.log(JSON.stringify({ ok: true, checked: 'shepherd-staging-smoke-lib' }));
