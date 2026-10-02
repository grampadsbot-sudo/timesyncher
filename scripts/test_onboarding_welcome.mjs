import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import { cannedWelcomeLiveTurn, renderOnboardingWelcome } from '../src/vacation/onboarding-welcome.mjs';
import { ensureOnboardingOpener } from '../routes/vacation-itinerary.mjs';

const root = new URL('../', import.meta.url);
const templates = JSON.parse(await readFile(new URL('../content/onboarding-welcome.json', import.meta.url), 'utf8'));

function token() {
  return `n${randomBytes(6).toString('hex')}`;
}

function fill(template, fields) {
  return template.replace(/\{(firstName|tripSiteUrl|collabFirstName|ownerFirstName|tripTitle)\}/g, (_, key) => fields[key]);
}

const firstName = token();
const collabFirstName = token();
const ownerFirstName = token();
const tripTitle = token();
const tripSiteUrl = `https://u.invalid/${token()}`;
const calls = { jev: 0, model: 0, fetch: 0 };
const stubs = {
  jevPrecall() {
    calls.jev += 1;
    throw new Error('jev called');
  },
  callTieredModel() {
    calls.model += 1;
    throw new Error('model called');
  },
};
const originalFetch = globalThis.fetch;
const originalError = console.error;
const logged = [];
globalThis.fetch = () => {
  calls.fetch += 1;
  throw new Error('fetch called');
};
console.error = (...args) => {
  logged.push(args.map((item) => String(item)).join(' '));
};

function rendered(input) {
  let text = null;
  try {
    text = renderOnboardingWelcome(input, stubs);
  } catch (error) {
    return { text: null, error };
  }
  return { text, error: null };
}

try {
  const owner = rendered({ audience: 'owner', firstName, tripSiteUrl });
  assert.equal(owner.error, null);
  assert.equal(owner.text, fill(templates.owner, { firstName, tripSiteUrl }));
  assert.equal(owner.text.includes(firstName), true);
  assert.equal(owner.text.includes(tripSiteUrl), true);
  assert.equal(/\{[A-Za-z0-9]+\}/.test(owner.text), false);

  const collaborator = rendered({
    audience: 'collaborator',
    collabFirstName,
    ownerFirstName,
    tripTitle,
    tripSiteUrl,
  });
  assert.equal(collaborator.error, null);
  assert.equal(collaborator.text, fill(templates.collaborator, {
    collabFirstName,
    ownerFirstName,
    tripTitle,
    tripSiteUrl,
  }));
  assert.notEqual(collaborator.text, owner.text);

  const before = logged.length;
  const missing = rendered({ audience: 'owner', firstName, tripSiteUrl: '   ' });
  assert.equal(missing.text, null);
  assert.match(missing.error.message, /tripSiteUrl/);
  assert.equal(missing.error.statusCode, 502);
  assert.match(logged[before], /tripSiteUrl/);
  assert.equal(logged[before].includes(owner.text), false);

  const missingCollab = rendered({
    audience: 'collaborator',
    collabFirstName: '',
    ownerFirstName,
    tripTitle,
    tripSiteUrl,
  });
  assert.equal(missingCollab.text, null);
  assert.match(missingCollab.error.message, /collabFirstName/);

  const live = cannedWelcomeLiveTurn({
    text: owner.text,
    at: '2026-10-01T00:00:00.000Z',
    latencyMs: 1,
    sessionE2eMs: 1,
  });
  assert.deepEqual(live.telemetry, {
    kind: 'canned_welcome',
    tier: 'n/a',
    model: 'n/a',
    jevRan: false,
    reason: 'fixed_onboarding_opener',
  });
  assert.doesNotMatch(templates.owner_no_site, /\{tripSiteUrl\}/);
  assert.doesNotMatch(templates.collaborator_no_site, /\{tripSiteUrl\}/);
  assert.equal(Object.hasOwn(live, 'jevLatencyMs'), false);
  assert.equal(Object.hasOwn(live, 'generationMs'), false);
  assert.equal(JSON.stringify(live).includes('jevLatencyMs'), false);
  assert.equal(JSON.stringify(live).includes('generationMs'), false);

  const trip = { id: 'trip-1', publicUrl: tripSiteUrl, title: tripTitle, shareToken: 'intake-trip1slug' };
  const stored = [];
  const db = async (strings, ...values) => {
    const query = strings.join(' ');
    if (/insert into transcript_turns/i.test(query)) {
      const payload = values.find((value) => value && typeof value === 'object' && value.liveTranscript);
      stored.push(payload);
      return [];
    }
    if (/from customers/i.test(query)) {
      return [{ first_name: ownerFirstName, display_name: ownerFirstName }];
    }
    if (/select 1/i.test(query)) {
      const tripId = values[1];
      if (query.includes("payload->>'welcomeAudience' = 'collaborator'")) {
        const welcomeFor = values[2];
        const found = stored.some((row) => row.selectedTripId === tripId && row.welcomeAudience === 'collaborator' && row.welcomeFor === welcomeFor);
        return found ? [1] : [];
      }
      const found = stored.some((row) => row.selectedTripId === tripId && row.welcomeAudience === 'owner');
      return found ? [1] : [];
    }
    throw new Error(`unexpected query ${query}`);
  };

  await ensureOnboardingOpener(db, {
    customer_id: 'owner-customer',
    first_name: firstName,
    display_name: firstName,
    metadata: {},
  }, trip, stubs);
  await ensureOnboardingOpener(db, {
    customer_id: 'owner-customer',
    first_name: firstName,
    display_name: firstName,
    metadata: {},
  }, trip, stubs);
  await ensureOnboardingOpener(db, {
    customer_id: 'collab-customer',
    first_name: collabFirstName,
    display_name: collabFirstName,
    metadata: {
      seat: {
        ownerCustomerId: 'owner-customer',
        ownerTripId: trip.id,
        displayName: collabFirstName,
      },
    },
  }, trip, stubs);

  assert.equal(stored.length, 2);
  assert.equal(stored[0].welcomeAudience, 'owner');
  assert.equal(stored[0].welcomeFor, 'owner');
  assert.equal(stored[0].liveTranscript.text, owner.text);
  assert.deepEqual(stored[0].liveTranscript.telemetry, {
    kind: 'canned_welcome',
    tier: 'n/a',
    model: 'n/a',
    jevRan: false,
    reason: 'fixed_onboarding_opener',
  });
  assert.equal(Object.hasOwn(stored[0].liveTranscript, 'jevLatencyMs'), false);
  assert.equal(Object.hasOwn(stored[0].liveTranscript, 'generationMs'), false);
  assert.equal(stored[1].welcomeAudience, 'collaborator');
  assert.equal(stored[1].welcomeFor, 'collab-customer');
  assert.equal(stored[1].liveTranscript.text, collaborator.text);
  assert.notEqual(stored[1].liveTranscript.text, stored[0].liveTranscript.text);
  assert.deepEqual(stored[1].liveTranscript.telemetry, {
    kind: 'canned_welcome',
    tier: 'n/a',
    model: 'n/a',
    jevRan: false,
    reason: 'fixed_onboarding_opener',
  });

  const storedBeforeMiss = stored.length;
  await assert.rejects(
    () => ensureOnboardingOpener(db, {
      customer_id: 'owner-customer-2',
      first_name: ' ',
      display_name: '',
      metadata: {},
    }, { ...trip, id: 'trip-2' }, stubs),
    /firstName/,
  );
  assert.equal(stored.length, storedBeforeMiss);

  const api = await readFile(new URL('routes/vacation-itinerary.mjs', root), 'utf8');
  const appGet = api.slice(api.indexOf('async function handleVacationApp'), api.indexOf("if (req.method === 'POST')", api.indexOf('async function handleVacationApp')));
  const acceptedAt = appGet.indexOf('eula.accepted');
  const openerAt = appGet.indexOf('ensureOnboardingOpener');
  const turnsAt = appGet.indexOf('loadVacationAppTurns');
  assert.ok(acceptedAt >= 0 && acceptedAt < openerAt && openerAt < turnsAt);
  assert.match(appGet, /if \(eula\.accepted && !seatFromSession\(session\)\)/);
  assert.match(appGet, /await ensureOnboardingOpener\(db, session, selected \|\| null\)/);
  assert.match(api, /welcomeAudience = seat \? 'collaborator' : 'owner'/);
  assert.match(api, /welcomeFor = seat \? String\(session\.customer_id\) : 'owner'/);
  const queueAt = api.indexOf('async function queueVacationAppTurn');
  const queueBody = api.slice(queueAt, api.indexOf('\nasync function ', queueAt + 10));
  assert.ok(queueBody.indexOf('ensureOnboardingOpener') >= 0);
  assert.ok(queueBody.indexOf('ensureOnboardingOpener') < queueBody.indexOf('insert into transcript_turns'));

  const welcomeSource = await readFile(new URL('src/vacation/onboarding-welcome.mjs', root), 'utf8');
  const liveSource = await readFile(new URL('src/vacation/live-app-turn.mjs', root), 'utf8');
  const rulesSource = await readFile(new URL('scripts/vacation-app-reply-rules.mjs', root), 'utf8');
  assert.doesNotMatch(welcomeSource, /produceOnboardingOpener|jevPrecall\s*\(|callTieredModel\s*\(|fetch\(/);
  assert.doesNotMatch(liveSource, /produceOnboardingOpener|ONBOARDING_WELCOME_INSTRUCTION|validateOnboardingWelcome|welcomeTurn/);
  assert.doesNotMatch(rulesSource, /welcomeTurn/);
  assert.doesNotMatch(api, /produceOnboardingOpener|onboarding opener model returned no reply/);
  for (const sentence of [...templates.owner.split('\n\n'), templates.collaborator]) {
    assert.equal(welcomeSource.includes(sentence), false);
    assert.equal(liveSource.includes(sentence), false);
    assert.equal(rulesSource.includes(sentence), false);
    assert.equal(api.includes(sentence), false);
  }

  assert.equal(calls.jev, 0);
  assert.equal(calls.model, 0);
  assert.equal(calls.fetch, 0);
} finally {
  globalThis.fetch = originalFetch;
  console.error = originalError;
}

console.log('onboarding welcome passed');
