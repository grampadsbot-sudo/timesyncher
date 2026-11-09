import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadChatItineraryEditConfig, shareSlugEditGuardDecision } from '../src/vacation/chat-itinerary-edit.mjs';

const TURNS = [
  'Thanks!',
  'Which of our saved places could work for a low-key first evening? This is a question only; leave the itinerary unchanged.',
  'Using places already saved on our trip, suggest a relaxed Thursday with a morning activity, lunch, and an evening out. Explain how the choices fit together and keep walking light. This is advice only; leave the itinerary unchanged.',
  'We need a thoughtful judgment call: compare two alternative two-day plans using our saved trip places. Balance a limited budget, a traveler who tires after a mile of walking, rain risk, dinner timing before an evening performance, and reservation uncertainty. Explain the tradeoffs and recommend the better plan with reasons grounded in our itinerary. Do not invent prices or availability. This is Q&A only; leave the itinerary unchanged.',
];

function protectedHash(payload) {
  const subset = { thingOverrides: payload.thingOverrides || {}, assignments: payload.assignments || {}, days: payload.days || [] };
  return createHash('sha256').update(JSON.stringify(subset)).digest('hex');
}

export function chatQaProofErrors(proof) {
  const errors = [];
  if (proof.buildSha !== proof.expectedHead || proof.finalBuildSha !== proof.expectedHead) errors.push('staging_head_mismatch');
  if (proof.protectedBefore !== proof.protectedAfter) errors.push('protected_trip_changed');
  if (proof.protectedBefore !== proof.expectedProtectedHash) errors.push('protected_hash_mismatch');
  if (proof.turns?.length !== 4) errors.push('four_turns_required');
  const names = (proof.placeNames || []).map((name) => String(name).toLowerCase()).filter(Boolean);
  for (let index = 0; index < (proof.turns || []).length; index += 1) {
    const turn = proof.turns[index];
    const tier = index + 1;
    const fail = (reason) => errors.push(`T${tier}:${reason}`);
    if (!(turn.httpStatus >= 200 && turn.httpStatus < 300) || turn.ok !== true) fail('http_or_app_failure');
    if (!String(turn.reply || '').trim()) fail('empty_reply');
    if (turn.modelTier !== tier || turn.jevRan !== true || turn.jevBeforeModel !== true) fail('jev_tier_mismatch');
    if (turn.responseModel !== 'anthropic/claude-haiku-5.5') fail('model_mismatch');
    if (!Number.isFinite(turn.replyMs) || turn.replyMs < 200 || !Number.isFinite(turn.generationMs) || turn.generationMs < 200) fail('generation_timing_missing_or_short');
    if (tier >= 3 && !names.some((name) => String(turn.reply || '').toLowerCase().includes(name))) fail('not_trip_grounded');
  }
  return errors;
}

async function main() {
  const [sessionFile, tripId, slug, evidenceDir, expectedHead, expectedProtectedHash] = process.argv.slice(2);
  assert.ok(sessionFile && tripId && slug && evidenceDir && expectedHead && expectedProtectedHash,
    'usage: node scripts/chat_qa_live_probe.mjs <session-file> <copy-trip-id> <allowlisted-copy-slug> <evidence-dir> <expected-head> <expected-8CQX-hash>');
  const config = loadChatItineraryEditConfig();
  assert.equal(shareSlugEditGuardDecision(slug, config).ok, true, 'copy must be allowlisted and not demo_locked');
  const base = 'https://vacation-staging.timesyncher.com';
  const session = fs.readFileSync(path.resolve(sessionFile), 'utf8').trim();
  assert.ok(session, 'session_required');
  const app = new URL('/api/vacation-itinerary', base);
  app.search = new URLSearchParams({ app: '1', session, tripId }).toString();
  const get = async (url, body = null) => {
    const started = Date.now();
    const response = await fetch(url, {
      method: body ? 'POST' : 'GET',
      headers: { accept: 'application/json', ...(body ? { 'content-type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(180000),
    });
    return { httpStatus: response.status, body: await response.json(), elapsedMs: Date.now() - started };
  };
  const identity = await get(app);
  assert.equal(identity.body.trip?.id, tripId, 'selected_copy_trip_mismatch');
  assert.equal(identity.body.trip?.shareToken, slug, 'selected_copy_slug_mismatch');
  assert.equal(identity.body.eula?.accepted, true, 'accepted_session_required');
  const version = await get(`${base}/api/version`);
  assert.equal(version.body.sha, expectedHead, 'staging_head_mismatch');
  const shared = await get(`${base}/api/shared/${encodeURIComponent(slug)}/`);
  assert.equal(shared.httpStatus, 200, 'copy_payload_required');
  assert.ok(Array.isArray(shared.body.places) && shared.body.places.length, 'copy_places_required');
  const protectedSlug = config.demoLocked[0];
  assert.ok(protectedSlug, 'protected_slug_required');
  const protectedUrl = `${base}/api/shared/${encodeURIComponent(protectedSlug)}/`;
  const before = await get(protectedUrl);
  assert.equal(before.httpStatus, 200, 'protected_payload_required');
  const proof = {
    expectedHead, buildSha: version.body.sha, expectedProtectedHash,
    copyTripId: tripId, copySlug: slug, at: new Date().toISOString(),
    placeNames: shared.body.places.map((place) => String(place.name || place.title || '').trim()).filter(Boolean),
    protectedBefore: protectedHash(before.body), turns: [], errors: [],
  };
  const output = path.resolve(evidenceDir, 'chat-qa-proof.json');
  fs.mkdirSync(path.dirname(output), { recursive: true });
  const write = () => fs.writeFileSync(output, `${JSON.stringify(proof, null, 2)}\n`);
  write();
  try {
    for (const [index, text] of TURNS.entries()) {
      const draft = await get(app, { tripId, text });
      const final = draft.body.status === 'interim' ? await get(app, { action: 'finish-rewrite', tripId }) : draft;
      const body = final.body;
      const jev = body.jev || draft.body.jev || {};
      const history = await get(app);
      const stored = (history.body.turns || []).findLast((turn) => turn.speaker === 'app' && turn.body === body.reply);
      proof.turns.push({
        expectedTier: index + 1, question: text, httpStatus: final.httpStatus, ok: body.ok,
        reply: body.reply || '', error: body.error || body.reason || null,
        modelTier: jev.modelTier, jevRan: jev.jevRan, jevBeforeModel: jev.jevBeforeModel,
        responseModel: body.responseModel || stored?.modelId || null,
        generationMs: stored?.generationMs ?? null,
        replyMs: draft.body.stageTimings?.replyMs ?? null,
        elapsedMs: draft.elapsedMs + (final === draft ? 0 : final.elapsedMs),
      });
      write();
      process.stdout.write(`T${index + 1} recorded at ${version.body.sha}\n`);
    }
  } finally {
    const after = await get(protectedUrl);
    assert.equal(after.httpStatus, 200, 'protected_payload_required');
    proof.protectedAfter = protectedHash(after.body);
    proof.finalBuildSha = (await get(`${base}/api/version`)).body.sha;
    proof.errors = chatQaProofErrors(proof);
    write();
  }
  assert.deepEqual(proof.errors, [], `proof failed: ${proof.errors.join(', ')}; evidence ${output}`);
  process.stdout.write(`chat QA proof recorded at ${proof.buildSha}: ${output}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    process.stderr.write(`${error?.message || error}\n`);
    process.exitCode = 1;
  });
}
