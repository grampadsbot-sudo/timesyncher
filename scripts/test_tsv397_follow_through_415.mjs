#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  XAI_PLACE_SEARCH_MODEL_ENV,
  xaiGrokPlaceSearchModelId,
} from './vacation-app-reply-rules.mjs';
import {
  BRAVE_SEARCH_API_KEY_NAME,
  TAVILI_API_KEY_NAME,
  buildProviderEnv,
} from '../src/vacation/provider-env.mjs';
import {
  logoCaptureMissReason,
  NAMED_THING_LOGOS,
  sourceLogoUrl,
} from '../src/vacation/thing-logo-capture.mjs';
import { requireWebEditAccess, webAccessTokenHash } from '../src/vacation/web-access.mjs';

const replyRulesSource = readFileSync(new URL('./vacation-app-reply-rules.mjs', import.meta.url), 'utf8');
const providerEnvSource = readFileSync(new URL('../src/vacation/provider-env.mjs', import.meta.url), 'utf8');
const logoSource = readFileSync(new URL('../src/vacation/thing-logo-capture.mjs', import.meta.url), 'utf8');
const webAccessSource = readFileSync(new URL('../src/vacation/web-access.mjs', import.meta.url), 'utf8');

assert.doesNotMatch(replyRulesSource, /fromCharCode\s*\(\s*103,\s*114,\s*111,\s*107/);
assert.match(replyRulesSource, /XAI_PLACE_SEARCH_MODEL/);
assert.doesNotMatch(providerEnvSource, /envKeyBySuffix|endsWith\(suffix\)/);
assert.doesNotMatch(providerEnvSource, /\['BRAVE',\s*'SEARCH'/);
assert.match(providerEnvSource, /BRAVE_SEARCH_API_KEY/);
assert.match(providerEnvSource, /TAVILI_API_KEY/);
assert.doesNotMatch(webAccessSource, /x-timesyncher-owner-customer-id/);

assert.equal(XAI_PLACE_SEARCH_MODEL_ENV, 'XAI_PLACE_SEARCH_MODEL');
assert.throws(
  () => xaiGrokPlaceSearchModelId({}),
  (error) => error.code === 'XAI_PLACE_SEARCH_MODEL_MISSING',
);
assert.equal(
  xaiGrokPlaceSearchModelId({ XAI_PLACE_SEARCH_MODEL: 'grok-4.3' }),
  'grok-4.3',
);

const decoyEnv = {
  MY_E_SEARCH_API_KEY: 'decoy-brave',
  CUSTOM_ILI_API_KEY: 'decoy-tavily',
  BRAVE_SEARCH_API_KEY: 'real-brave',
  TAVILI_API_KEY: 'real-tavily',
};
const built = buildProviderEnv(decoyEnv);
assert.equal(built.brave, 'real-brave');
assert.equal(built.tavily, 'real-tavily');
assert.equal(built.braveName, BRAVE_SEARCH_API_KEY_NAME);
assert.equal(built.tavilyName, TAVILI_API_KEY_NAME);

assert.equal(sourceLogoUrl({ name: 'Hertz', category_name: 'Car' }, { category: 'car' }), '');
assert.equal(logoCaptureMissReason({ name: 'Hertz', category_name: 'Car' }), 'no_place_website');
assert.equal(
  sourceLogoUrl({ name: 'Hertz', category_name: 'Car', url: 'https://www.hertz.com/rentacar' }),
  NAMED_THING_LOGOS.hertz,
);

const tripId = '11111111-1111-1111-1111-111111111111';
const forgedOwner = '22222222-2222-2222-2222-222222222222';
const env = { TIMESYNCHER_WEB_ACCESS_TOKEN_SALT: 'tsv415-test-salt' };
const sessionToken = 'accepted-editor-session';
const sessionHash = webAccessTokenHash(sessionToken, env);

const db = async (strings, ...values) => {
  const query = String(strings.raw ? strings.raw.join('?') : strings);
  if (/create table if not exists vacation_web_access_grants/i.test(query)) return [];
  if (/alter table vacation_web_access_grants/i.test(query)) return [];
  if (/create unique index if not exists vacation_web_access_active_email_idx/i.test(query)) return [];
  if (/from vacation_web_access_grants/i.test(query) && /session_token_hash/i.test(query)) {
    if (values.includes(sessionHash)) {
      return [{
        id: 'grant-1',
        trip_id: tripId,
        role: 'web_editor',
        email: 'editor@example.com',
        status: 'accepted',
      }];
    }
    return [];
  }
  if (/update vacation_web_access_grants/i.test(query)) return [];
  throw new Error(`unexpected query in test db stub: ${query}`);
};

await assert.rejects(
  () => requireWebEditAccess(db, {
    headers: {
      'x-timesyncher-owner-customer-id': forgedOwner,
    },
  }, { tripId, ownerCustomerId: forgedOwner, env }),
  (error) => error.statusCode === 403,
  'forged owner header/body must not grant edit access',
);

const accepted = await requireWebEditAccess(db, {
  headers: {
    cookie: `ts_vacation_web_access=${encodeURIComponent(sessionToken)}`,
  },
}, { tripId, ownerCustomerId: forgedOwner, env });
assert.equal(accepted.role, 'web_editor');

process.stdout.write('tsv397 follow-through 415 tests passed\n');
