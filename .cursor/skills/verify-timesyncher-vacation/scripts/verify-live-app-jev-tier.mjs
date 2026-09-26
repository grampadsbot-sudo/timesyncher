#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DIALOG_TEST_FINGERPRINT, SHARED_REPLY_PIPELINE, bakeoffTierModels, isBakeoffModelId } from '../../../../scripts/vacation-app-reply-rules.mjs';
import { item34BanHit, replyLeavesDestination, upsellAudit } from '../../../../src/vacation/live-app-turn.mjs';

const root = fileURLToPath(new URL('../../../..', import.meta.url));
const CANNED = 'Got it. I saved that';
const PRODUCER = 'vacation-app-reply-rules';
const OPENER_PRODUCER = 'vacation-app-onboarding-opener';
const OPENER_REASON = 'fixed_onboarding_opener';

function argValue(flag) {
  const index = process.argv.indexOf(flag);
  return index === -1 ? '' : (process.argv[index + 1] || '');
}

export function assertComposerSource({ vacationApp, api, liveTurn, replyRules }) {
  const errors = [];
  if (!/data\.reply/.test(vacationApp) || /Got it\. I saved that/.test(vacationApp)) {
    errors.push('composer does not render the live reply, or it still has the canned bubble');
  }
  if (!/produceLiveAppReply/.test(api) || !/jevStamp/.test(api)) {
    errors.push('vacation-app API does not store the shared-producer reply and Jev stamp');
  }
  if (!/ensureOnboardingOpener/.test(api) || !/onboardingOpenerText/.test(api)) {
    errors.push('vacation-app API does not store the customer-visible onboarding opener');
  }
  const jevAt = liveTurn.indexOf('await jevPrecall');
  const modelAt = liveTurn.indexOf('await callTieredModel');
  if (jevAt < 0 || modelAt < 0 || jevAt > modelAt) {
    errors.push('live reply path does not call Jev before the tiered model');
  }
  if (!/if \(!jev\?\.jevRan\)/.test(liveTurn)) {
    errors.push('live reply path can call the tiered model when Jev did not run');
  }
  if (/stampSharedReply/.test(liveTurn) || /stampSharedReply/.test(api)) {
    errors.push('live customer reply is stamped with the dialog test fingerprint');
  }
  if (!liveTurn.includes(PRODUCER)) {
    errors.push('live app turns are not marked vacation-app-reply-rules');
  }
  const timedAt = liveTurn.indexOf('jevLatencyMs');
  if (timedAt < 0 || modelAt < 0 || timedAt > modelAt || !/jevBeforeModel = true/.test(liveTurn)) {
    errors.push('live reply path does not record Jev classify ms before the model call');
  }
  if (!/modelId/.test(liveTurn)) errors.push('live app turns do not store the bake-off model id');
  if (!/real banter/.test(replyRules) || !/Single upsell/.test(replyRules) || !/at most one full collab/.test(replyRules)) {
    errors.push('shared producer does not keep a single customer-pulled collab upsell');
  }
  if (!/unlimited vacations for the whole year/.test(replyRules)) {
    errors.push('shared producer drops the exact unlimited-vacations phrase');
  }
  if (!/limit 120/.test(api)) {
    errors.push('vacation-app memory does not keep the early intake for the destination lock');
  }
  if (!/Use 3 or 4/.test(replyRules)) {
    errors.push('Jev tier criteria do not allow tiers 3 and 4 when the turn needs them');
  }
  const map = bakeoffTierModels();
  for (const tier of [1, 2, 3, 4]) {
    if (!replyRules.includes(map[tier])) errors.push(`shared producer map is missing ${map[tier]}`);
  }
  if (/openai\/gpt-4\.1-mini/.test(replyRules) || !/gpt-\.\*mini/.test(replyRules)) {
    errors.push('shared producer does not fail closed on gpt mini models');
  }
  if (!/tier_models\.json/.test(replyRules) || !/tier_outside_bakeoff_map/.test(replyRules)) {
    errors.push('shared producer does not fail closed when tier_models.json drifts');
  }
  if (!/Destination lock/.test(replyRules) || !/replyLeavesDestination/.test(liveTurn)) {
    errors.push('shared producer does not lock replies to the customer destination');
  }
  if (!/never say "splitting payments"/.test(replyRules) || !/stripItem34Ban/.test(liveTurn) || !/item34_ban/.test(liveTurn)) {
    errors.push('shared producer does not fail closed on split-payment jargon');
  }
  if (!/jevQualityRewrite/.test(liveTurn) || !/quality_unjudged/.test(liveTurn) || !/export async function jevQualityRewrite/.test(replyRules)) {
    errors.push('shared producer does not judge every app reply with Jev');
  }
  if (!/building the itinerary/.test(liveTurn) || !/Post-intake:/.test(replyRules)) {
    errors.push('shared producer does not acknowledge the itinerary and give the collab welcome right after long intake');
  }
  if (!/data-screen="itinerary"/.test(vacationApp) || !/data-screen="thing"/.test(vacationApp) || !/data-screen="onboarding"/.test(vacationApp)) {
    errors.push('vacation app is missing the onboarding, itinerary, and thing screens');
  }
  if (!/thingsFromIntake/.test(api)) {
    errors.push('vacation app does not build things from the long intake');
  }
  if (!replyRules.includes(SHARED_REPLY_PIPELINE) || !/export async function jevPrecall/.test(replyRules) || !/export async function callTieredModel/.test(replyRules)) {
    errors.push('shared producer contract is missing Jev-then-tier exports');
  }
  if (/dialog_vacation_test_turn\s*\(/.test(`${liveTurn}\n${api}`)) {
    errors.push('live path calls dialog_vacation_test_turn');
  }
  return errors;
}

function jevErrors(turn) {
  const errors = [];
  const label = `turn ${turn.turnIndex ?? '?'}`;
  const jev = turn.jev;
  if (!jev || typeof jev !== 'object') {
    errors.push(`${label} is missing Jev output`);
    return errors;
  }
  if (jev.jevRan === true) {
    const tier = Number(jev.modelTier);
    if (!Number.isInteger(tier) || tier < 1 || tier > 5) {
      errors.push(`${label} jevRan true without model tier 1-5`);
    }
    if (!String(jev.routeType || '').trim()) {
      errors.push(`${label} jevRan true without a route`);
    }
  } else if (jev.jevRan === false) {
    if (!String(jev.reason || '').trim()) errors.push(`${label} jevRan false without a reason`);
    if (jev.modelTier != null) errors.push(`${label} invented a model tier when Jev did not run`);
  } else {
    errors.push(`${label} jevRan must be true or false`);
  }
  return errors;
}

export function assertLiveTurns(doc, { requireRan = false } = {}) {
  const errors = [];
  const turns = Array.isArray(doc?.turns) ? doc.turns : [];
  if (doc?.live !== true || doc?.capture !== 'live-vacation-app') {
    errors.push('document is not a live vacation-app transcript');
  }
  if (!turns.length) errors.push('live transcript has no turns');
  let ran = 0;
  turns.forEach((turn, index) => {
    errors.push(...jevErrors(turn));
    const text = String(turn.text || '');
    if (item34BanHit(text)) errors.push(`turn ${turn.turnIndex} uses split-payment jargon`);
    if (turn.role !== 'app') return;
    const fixedOpener = index === 0 && (turn.fixedOpener === true || turn.replyProducer === OPENER_PRODUCER);
    if (turn.invented === true) errors.push(`turn ${turn.turnIndex} app text is marked invented`);
    if (!text.trim() || text.includes(CANNED) || text.includes(DIALOG_TEST_FINGERPRINT) || /dialog_vacation_test_turn|openrouter-selfcall/i.test(text)) {
      errors.push(`turn ${turn.turnIndex} app text is empty, canned, or from a pack sim`);
    }
    if (turn.storedText != null && String(turn.storedText) !== text) {
      errors.push(`turn ${turn.turnIndex} stored text does not match the customer-visible body`);
    }
    if (fixedOpener) {
      if (turn.replyProducer !== OPENER_PRODUCER) errors.push(`turn ${turn.turnIndex} fixed opener is not from ${OPENER_PRODUCER}`);
      if (turn.jev?.jevRan !== false || turn.jev?.reason !== OPENER_REASON) {
        errors.push(`turn ${turn.turnIndex} fixed opener must record jevRan false and reason ${OPENER_REASON}`);
      }
      return;
    }
    if (turn.replyProducer !== PRODUCER) errors.push(`turn ${turn.turnIndex} app text is not from ${PRODUCER}`);
    if (turn.jev?.jevRan !== true) errors.push(`turn ${turn.turnIndex} app text exists without Jev`);
    const modelId = String(turn.modelId || turn.model?.responseModel || turn.jev?.responseModel || '');
    if (!isBakeoffModelId(modelId)) errors.push(`turn ${turn.turnIndex} model is outside the bake-off map`);
    if (!Number.isFinite(Number(turn.jevLatencyMs ?? turn.jev?.jevLatencyMs))) {
      errors.push(`turn ${turn.turnIndex} is missing Jev classify ms`);
    }
    if (turn.jevBeforeModel !== true && turn.jev?.jevBeforeModel !== true) {
      errors.push(`turn ${turn.turnIndex} does not prove Jev ran before the model`);
    }
    const score = Number(turn.quality?.score);
    const comment = String(turn.quality?.comment || '').trim();
    if (turn.quality?.judged !== true || !Number.isInteger(score) || score < 1 || score > 5 || !comment) {
      errors.push(`turn ${turn.turnIndex} quality is not judged`);
    }
    if (/not judged/i.test(text) || /not judged/i.test(comment)) {
      errors.push(`turn ${turn.turnIndex} quality is not judged`);
    }
    if (turn.jev?.jevRan === true) ran += 1;
  });
  if (requireRan && ran < 1) errors.push('no stored app turn records jevRan true with a tier');
  return errors;
}

export function assertSingleUpsell(doc) {
  const audit = upsellAudit(doc?.turns);
  const errors = [];
  if (audit.unsolicitedFull.length) errors.push(`unsolicited full upsell at turns ${audit.unsolicitedFull.join(', ')}`);
  if (audit.unsolicitedWelcome.length) errors.push(`unsolicited collab welcome at turns ${audit.unsolicitedWelcome.join(', ')}`);
  if (audit.softEmbeds.length) errors.push(`unlimited phrase embedded without a pull at turns ${audit.softEmbeds.join(', ')}`);
  if (audit.full > 1) errors.push(`full upsell count ${audit.full}, at most one`);
  return errors;
}

export function assertDestinationStick(doc) {
  const errors = [];
  const turns = Array.isArray(doc?.turns) ? doc.turns : [];
  const blob = turns.map((turn) => String(turn.text || '')).join('\n');
  if (!/big island|kailua-kona|hawai/i.test(blob)) return errors;
  for (const turn of turns) {
    if (turn.role !== 'app') continue;
    if (replyLeavesDestination(turn.text, 'Big Island, Hawaii')) {
      errors.push(`turn ${turn.turnIndex} leaves the Big Island`);
    }
  }
  return errors;
}

export function assertGoldSessionDepth(doc) {
  const errors = [];
  const turns = Array.isArray(doc?.turns) ? doc.turns : [];
  const apps = turns.filter((turn) => turn.role === 'app' && turn.jev?.jevRan === true);
  if (apps.length < 20) errors.push(`long_intake_and_depth: ${apps.length} generated app turns, need at least 20`);
  const lengths = apps.map((turn) => String(turn.text || '').trim().split(/\s+/).filter(Boolean).length).sort((a, b) => a - b);
  const median = lengths.length ? lengths[Math.floor((lengths.length - 1) / 2)] : 0;
  if (median < 40) errors.push(`banter richness: median app words ${median}, need at least 40`);
  const blob = turns.map((turn) => String(turn.text || '')).join('\n');
  if (!/voice note|ramble/i.test(blob) || blob.length < 1200) {
    errors.push('missing long trip intake');
  }
  if (!/collaborat/i.test(blob)) errors.push('missing collaborator onboard');
  const opener = turns[0];
  if (opener?.role !== 'app') errors.push('missing app open');
  return errors;
}

function sampleTurn(overrides = {}) {
  return {
    turnIndex: 1,
    role: 'customer',
    modality: 'text',
    text: 'Harbor morning plan for Craig',
    latencyMs: 12,
    sessionE2eMs: 12,
    jev: { jevRan: true, modelTier: 2, routeType: 'general' },
    ...overrides,
  };
}

function appTurn(overrides = {}) {
  return sampleTurn({
    turnIndex: 2,
    role: 'app',
    text: 'Start with the harbor walk.',
    replyProducer: PRODUCER,
    invented: false,
    jev: { jevRan: true, modelTier: 2, routeType: 'itinerary_advice', responseModel: 'qwen/qwen3-235b-a22b-2507', jevLatencyMs: 120, jevBeforeModel: true },
    modelId: 'qwen/qwen3-235b-a22b-2507',
    jevLatencyMs: 120,
    genLatencyMs: 400,
    jevBeforeModel: true,
    quality: { judged: true, score: 4, comment: 'Clear day shape.', rewritten: false },
    ...overrides,
  });
}

function liveDoc(turns) {
  return { live: true, capture: 'live-vacation-app', targetPerson: 'Craig', turns };
}

async function readSources() {
  const [vacationApp, api, liveTurn, replyRules] = await Promise.all([
    readFile(path.join(root, 'vacation-app.html'), 'utf8'),
    readFile(path.join(root, 'api/vacation-itinerary.mjs'), 'utf8'),
    readFile(path.join(root, 'src/vacation/live-app-turn.mjs'), 'utf8'),
    readFile(path.join(root, 'scripts/vacation-app-reply-rules.mjs'), 'utf8'),
  ]);
  return { vacationApp, api, liveTurn, replyRules };
}

function fail(errors) {
  for (const error of errors) process.stderr.write(`${error}\n`);
  process.exitCode = 1;
}

async function selfCheck() {
  const skipped = liveDoc([sampleTurn({
    jev: { jevRan: false, reason: 'classify_pending', modelTier: null, routeType: null },
  })]);
  assert.deepEqual(assertLiveTurns(skipped), []);
  assert.ok(assertLiveTurns(liveDoc([sampleTurn({ jev: null })])).length);
  assert.ok(assertLiveTurns(liveDoc([sampleTurn({ jev: { jevRan: true, routeType: 'general' } })])).length);
  assert.ok(assertLiveTurns(liveDoc([sampleTurn({ jev: { jevRan: false, modelTier: null } })])).length);
  assert.ok(assertLiveTurns(liveDoc([sampleTurn(), appTurn({ text: `${CANNED} for this vacation.` })])).length);
  assert.ok(assertLiveTurns(liveDoc([sampleTurn(), appTurn({ invented: true })])).length);
  assert.deepEqual(assertLiveTurns(liveDoc([sampleTurn(), appTurn()]), { requireRan: true }), []);
  assert.ok(assertLiveTurns(liveDoc([sampleTurn(), appTurn({ modelId: 'openai/gpt-4.1-mini' })])).some((error) => /bake-off map/.test(error)));
  assert.ok(assertLiveTurns(liveDoc([sampleTurn(), appTurn({ modelId: 'google/gemini-2.5-flash' })])).some((error) => /bake-off map/.test(error)));
  const openerTurn = {
    turnIndex: 1,
    role: 'app',
    modality: 'text',
    text: 'Welcome. Your vacation website is not built yet, so this chat is the whole workspace.',
    latencyMs: 0,
    sessionE2eMs: 0,
    replyProducer: OPENER_PRODUCER,
    fixedOpener: true,
    invented: false,
    jev: { jevRan: false, reason: OPENER_REASON, modelTier: null, routeType: null },
  };
  assert.deepEqual(assertLiveTurns(liveDoc([
    openerTurn,
    sampleTurn({ turnIndex: 2 }),
    appTurn({ turnIndex: 3 }),
  ]), { requireRan: true }), []);
  assert.ok(assertLiveTurns(liveDoc([sampleTurn(), { ...openerTurn, turnIndex: 2 }])).length);
  assert.ok(assertLiveTurns(liveDoc([{
    ...openerTurn,
    jev: { jevRan: true, modelTier: 1, routeType: 'general' },
  }])).length);
  const sources = await readSources();
  assert.deepEqual(assertComposerSource(sources), []);
  const opener = 'Welcome. I am here to build this vacation with you. Your website is not built yet, so this chat is the whole workspace.';
  const pulled = liveDoc([
    { ...openerTurn, text: opener },
    sampleTurn({ turnIndex: 2, text: 'How much if they join as collaborators? Name unlimited vacations for the whole year.' }),
    appTurn({ turnIndex: 3, text: 'Welcome them onto this vacation as collaborators. The household plan is unlimited vacations for the whole year.' }),
    sampleTurn({ turnIndex: 4, text: 'Friday dinner on the Big Island. Name the day and the place.' }),
    appTurn({ turnIndex: 5, text: 'Friday dinner stays in Kailua-Kona with Kimberly.' }),
  ]);
  assert.deepEqual(assertSingleUpsell(pulled), []);
  assert.ok(assertSingleUpsell(liveDoc([
    sampleTurn({ turnIndex: 1, text: 'Walk Thursday with Kimberly.' }),
    appTurn({ turnIndex: 2, text: 'Thursday is a town walk. Welcome the whole family as collaborators with unlimited vacations for the whole year.' }),
  ])).length);
  assert.deepEqual(assertDestinationStick(pulled), []);
  assert.ok(assertDestinationStick(liveDoc([
    sampleTurn({ text: 'Big Island week in Kailua-Kona.' }),
    appTurn({ text: 'Friday dinner in Tulum.' }),
  ])).length);
  assert.ok(assertLiveTurns(liveDoc([
    sampleTurn({ text: 'We are splitting payments across the seats.' }),
    appTurn(),
  ])).some((error) => /split-payment jargon/.test(error)));
  assert.ok(assertLiveTurns(liveDoc([
    sampleTurn(),
    appTurn({ text: 'Since you are splitting payments, Kimberly is covered.' }),
  ])).some((error) => /split-payment jargon/.test(error)));
  assert.ok(assertLiveTurns(liveDoc([
    sampleTurn(),
    appTurn({ quality: null }),
  ])).some((error) => /not judged/.test(error)));
  process.stdout.write('live app jev tier self-check passed\n');
}

async function loadSession(token) {
  if (!process.env.DATABASE_URL && !process.env.NEON_DATABASE_URL) {
    const { readFileSync } = await import('node:fs');
    const file = path.join(root, '.env.production.local');
    const text = readFileSync(file, 'utf8');
    for (const line of text.split('\n')) {
      if (!line || line.startsWith('#')) continue;
      const index = line.indexOf('=');
      if (index < 1) continue;
      const key = line.slice(0, index);
      let value = line.slice(index + 1);
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
      if (process.env[key] == null) process.env[key] = value;
    }
  }
  const { loadLiveTranscriptByToken } = await import('../../../../src/vacation/live-app-turn.mjs');
  const { sql } = await import('../../../../src/vacation/db.mjs');
  return loadLiveTranscriptByToken(sql(process.env), token);
}

async function main() {
  if (process.argv.includes('--self-check')) {
    await selfCheck();
    return;
  }
  const sources = await readSources();
  const sourceErrors = assertComposerSource(sources);
  if (sourceErrors.length) {
    fail(sourceErrors);
    return;
  }
  const transcriptPath = argValue('--transcript');
  const session = argValue('--session');
  if (!transcriptPath && !session) {
    process.stdout.write('live app jev tier source check passed\n');
    return;
  }
  const doc = transcriptPath
    ? JSON.parse(await readFile(transcriptPath, 'utf8'))
    : await loadSession(session);
  const errors = assertLiveTurns(doc, { requireRan: true });
  errors.push(...assertSingleUpsell(doc));
  errors.push(...assertDestinationStick(doc));
  if (process.argv.includes('--gold-depth')) errors.push(...assertGoldSessionDepth(doc));
  if (errors.length) {
    fail(errors);
    return;
  }
  const apps = doc.turns.filter((turn) => turn.role === 'app' && turn.jev?.jevRan === true);
  process.stdout.write(`${JSON.stringify({
    ok: true,
    sessionToken: doc.sessionToken || session || null,
    turns: doc.turns.length,
    appTurnsWithJev: apps.length,
    tiers: [...new Set(apps.map((turn) => turn.jev.modelTier))].sort(),
    routes: [...new Set(apps.map((turn) => turn.jev.routeType))].sort(),
  })}\n`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((error) => {
    process.stderr.write(`${error?.message || error}\n`);
    process.exit(1);
  });
}
