import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import {
  ONBOARDING_WELCOME_INSTRUCTION,
  onboardingWelcomeFacts,
  onboardingWelcomePrompt,
  produceOnboardingOpener,
  validateOnboardingWelcome,
} from '../src/vacation/live-app-turn.mjs';

const root = new URL('../', import.meta.url);
const cannedWelcome = /I can help you plan your trip|What destination do you have in mind|Welcome aboard|Your website is not built yet|Tell me the trip basics|onboardingOpenerText|ONBOARDING_OPENER_WITH_SITE|ONBOARDING_OPENER_CHAT_ONLY|CANNED_APP_REPLY/;
const site = 'https://trips.example/site';

async function sourceFiles() {
  const named = [
    'src/vacation/live-app-turn.mjs',
    'scripts/vacation-app-reply-rules.mjs',
  ];
  const dirs = ['routes', 'api'];
  const files = named.map((file) => new URL(file, root));
  for (const dir of dirs) {
    const abs = new URL(`${dir}/`, root);
    const entries = await readdir(abs, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.mjs')) continue;
      files.push(new URL(path.join(dir, entry.name), root));
    }
  }
  return files;
}

for (const file of await sourceFiles()) {
  const source = await readFile(file, 'utf8');
  assert.doesNotMatch(source, cannedWelcome, file.pathname);
}

const api = await readFile(new URL('routes/vacation-itinerary.mjs', root), 'utf8');
const appGet = api.slice(api.indexOf('async function handleVacationApp'), api.indexOf("if (req.method === 'POST')", api.indexOf('async function handleVacationApp')));
const acceptedAt = appGet.indexOf('eula.accepted');
const openerAt = appGet.indexOf('ensureOnboardingOpener');
const turnsAt = appGet.indexOf('loadVacationAppTurns');
assert.ok(acceptedAt >= 0 && acceptedAt < openerAt && openerAt < turnsAt);
assert.match(api, /welcomeAudience = seat \? 'collaborator' : 'owner'/);
assert.doesNotMatch(api, /if \(seatFromSession\(session\)\) return;/);

const ownerFacts = onboardingWelcomeFacts({
  firstName: 'Ada',
  tripSiteUrl: site,
  tripTitle: 'Anniversary',
  plan: 'single',
  collaborators: ['Sam'],
});
assert.equal(ownerFacts.firstName, 'Ada');
assert.equal(ownerFacts.tripSiteUrl, site);
assert.equal(ownerFacts.tripTitle, 'Anniversary');
assert.equal(ownerFacts.plan, 'single');
assert.deepEqual(ownerFacts.collaborators, ['Sam']);
assert.equal(ownerFacts.customer_said, null);
assert.equal(onboardingWelcomeFacts({ tripSiteUrl: site }).firstName, undefined);
const collabFacts = onboardingWelcomeFacts({
  audience: 'collaborator',
  ownerFirstName: 'Sam',
  collaboratorFirstName: 'Ada',
  tripTitle: 'Anniversary',
  tripSiteUrl: site,
});
assert.equal(collabFacts.ownerFirstName, 'Sam');
assert.equal(collabFacts.collaboratorFirstName, 'Ada');
assert.equal(collabFacts.tripSiteUrl, site);

const ownerPrompt = onboardingWelcomePrompt({
  firstName: 'Ada',
  tripSiteUrl: site,
  tripTitle: 'Anniversary',
  plan: 'single',
  collaborators: ['Sam'],
});
assert.match(ownerPrompt, new RegExp(ONBOARDING_WELCOME_INSTRUCTION.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
assert.match(ownerPrompt, new RegExp(site.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
assert.match(ownerPrompt, /"firstName":"Ada"/);
assert.doesNotMatch(ownerPrompt, cannedWelcome);

const ownerWelcome = [
  "Ada, you're set up.",
  `Your trip already has its own site at ${site}.`,
  'Anyone with that link can see the plans and photos without signing in.',
  'You describe the trip, and the app builds a day-by-day itinerary on that site, with lodging, each day\'s plans, and notes for each day and place.',
  'During the trip, the family adds photos, videos, and stories, and at the end it all becomes a keepsake you can keep.',
  'Hold the mic and talk for a minute or two about where and when, who is coming, where you are staying, what you are excited about, and what is still undecided.',
  "Rough or rambling is fine, and I'll follow up on any gaps you leave.",
  'When you are ready, send one long voice note.',
].join(' ');
const ownerCheck = validateOnboardingWelcome(ownerWelcome, {
  audience: 'owner',
  tripSiteUrl: site,
  allowedPlaces: ['Ada', 'Anniversary', 'Sam', site],
});
assert.deepEqual(ownerCheck.errors, []);
assert.equal(ownerCheck.ok, true);
assert.ok(ownerWelcome.split(/\s+/).length >= 90);

const collabWelcome = `Ada, Sam added you to the Anniversary trip. The site is ${site}. You can add ideas, photos, videos, and notes to any day or place whenever something comes to mind. Jump in when you like. What are you looking forward to?`;
const collabCheck = validateOnboardingWelcome(collabWelcome, {
  audience: 'collaborator',
  tripSiteUrl: site,
  allowedPlaces: ['Ada', 'Sam', 'Anniversary', site],
});
assert.deepEqual(collabCheck.errors, []);
assert.equal(validateOnboardingWelcome('Too short.', { audience: 'owner', tripSiteUrl: site }).ok, false);
assert.equal(validateOnboardingWelcome(`${ownerWelcome} Thing`, { audience: 'owner', tripSiteUrl: site, allowedPlaces: ['Ada'] }).ok, false);
assert.equal(validateOnboardingWelcome(ownerWelcome.replace(site, 'the site'), { audience: 'owner', tripSiteUrl: site, allowedPlaces: ['Ada'] }).ok, false);
assert.equal(validateOnboardingWelcome(ownerWelcome.replace(/voice note\.$/, 'story.'), { audience: 'owner', tripSiteUrl: site, allowedPlaces: ['Ada'] }).ok, false);
assert.ok(validateOnboardingWelcome(`${ownerWelcome} We should see Paris.`, { audience: 'owner', tripSiteUrl: site, allowedPlaces: ['Ada'] }).errors.some((error) => error === 'place:Paris'));

const originalFetch = globalThis.fetch;
const chatCalls = [];

function jevOk() {
  return {
    ok: true,
    json: async () => ({
      ok: true,
      answers: { model_tier: { score: 0 }, route_type: { choice: 'general' } },
    }),
  };
}

globalThis.fetch = async (url, init) => {
  const target = String(url);
  const body = init?.body ? JSON.parse(init.body) : {};
  if (target.includes('/api/alpha/decisions')) return jevOk();
  if (target.includes('/chat/completions')) {
    chatCalls.push(body);
    const system = body.messages?.find((message) => message.role === 'system')?.content || '';
    assert.equal(system, ownerPrompt);
    assert.match(system, /"firstName":"Ada"/);
    assert.match(system, new RegExp(site.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.doesNotMatch(system, cannedWelcome);
    return {
      ok: true,
      json: async () => ({
        model: body.model,
        choices: [{ message: { content: `${ownerWelcome}\nBEAT: welcomed the owner` } }],
      }),
    };
  }
  throw new Error(`unexpected ${target}`);
};

try {
  const produced = await produceOnboardingOpener({
    firstName: 'Ada',
    tripSiteUrl: site,
    tripTitle: 'Anniversary',
    plan: 'single',
    collaborators: ['Sam'],
    env: { OPENROUTER_API_KEY: 'test-key' },
  });
  assert.equal(chatCalls.length, 1);
  assert.equal(produced.reply, ownerWelcome);
  assert.equal(produced.reason, null);
  assert.deepEqual(validateOnboardingWelcome(produced.reply, {
    audience: 'owner',
    tripSiteUrl: site,
    allowedPlaces: ['Ada', 'Anniversary', 'Sam', site],
  }).errors, []);

  chatCalls.length = 0;
  const collabPrompt = onboardingWelcomePrompt({
    audience: 'collaborator',
    ownerFirstName: 'Sam',
    collaboratorFirstName: 'Ada',
    tripTitle: 'Anniversary',
    tripSiteUrl: site,
  });
  globalThis.fetch = async (url, init) => {
    const target = String(url);
    const body = init?.body ? JSON.parse(init.body) : {};
    if (target.includes('/api/alpha/decisions')) return jevOk();
    if (target.includes('/chat/completions')) {
      chatCalls.push(body);
      const system = body.messages?.find((message) => message.role === 'system')?.content || '';
      assert.equal(system, collabPrompt);
      assert.match(system, /"collaboratorFirstName":"Ada"/);
      assert.match(system, /"ownerFirstName":"Sam"/);
      assert.match(system, new RegExp(site.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
      return {
        ok: true,
        json: async () => ({
          model: body.model,
          choices: [{ message: { content: `${collabWelcome}\nBEAT: welcomed the collaborator` } }],
        }),
      };
    }
    throw new Error(`unexpected ${target}`);
  };
  const collaborator = await produceOnboardingOpener({
    audience: 'collaborator',
    ownerFirstName: 'Sam',
    collaboratorFirstName: 'Ada',
    tripTitle: 'Anniversary',
    tripSiteUrl: site,
    env: { OPENROUTER_API_KEY: 'test-key' },
  });
  assert.equal(chatCalls.length, 1);
  assert.equal(collaborator.reply, collabWelcome);
  assert.deepEqual(validateOnboardingWelcome(collaborator.reply, {
    audience: 'collaborator',
    tripSiteUrl: site,
    allowedPlaces: ['Ada', 'Sam', 'Anniversary', site],
  }).errors, []);

  chatCalls.length = 0;
  globalThis.fetch = async (url, init) => {
    const target = String(url);
    const body = init?.body ? JSON.parse(init.body) : {};
    if (target.includes('/api/alpha/decisions')) return jevOk();
    if (target.includes('/chat/completions')) {
      chatCalls.push(body);
      return { ok: false, status: 503, json: async () => ({ error: { message: 'model down' } }) };
    }
    throw new Error(`unexpected ${target}`);
  };
  const failed = await produceOnboardingOpener({
    firstName: 'Ada',
    tripSiteUrl: site,
    env: { OPENROUTER_API_KEY: 'test-key' },
  });
  assert.equal(chatCalls.length, 2);
  assert.equal(failed.reply, null);
  assert.equal(failed.reason, 'model down');
  assert.doesNotMatch(String(failed.reason), cannedWelcome);

  const missing = await produceOnboardingOpener({ firstName: 'Ada', env: { OPENROUTER_API_KEY: 'test-key' } });
  assert.equal(missing.reply, null);
  assert.equal(missing.reason, 'onboarding welcome missing tripSiteUrl');
} finally {
  globalThis.fetch = originalFetch;
}

console.log('onboarding welcome passed');
