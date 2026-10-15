#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { extractDetailFromSearchResults } from '../src/vacation/place-detail-extract.mjs';
import {
  buildCategoryDescription,
  isGenericDescription,
} from '../src/vacation/trip-thing-enrichment.mjs';
import { descriptionPassesDetailJudge } from '../src/vacation/thing-detail-fields.mjs';
import { payloadForXaiRecording } from './lib/pr336-gate-b-xai-recorded-lib.mjs';
import {
  XAI_PLACE_SEARCH_MODEL_ENV,
  xaiGrokPlaceSearchModelId,
} from './vacation-app-reply-rules.mjs';
import {
  BRAVE_PROVIDER_KEY_NAME,
  TAVILI_PROVIDER_KEY_NAME,
  buildProviderEnv,
} from '../src/vacation/provider-env.mjs';
import {
  logoCaptureMissReason,
  NAMED_THING_LOGOS,
  sourceLogoUrl,
} from '../src/vacation/thing-logo-capture.mjs';
import { requireWebEditAccess, webAccessTokenHash } from '../src/vacation/web-access.mjs';

const title = 'Blue Note Jazz Club';

const emptyEvent = buildCategoryDescription({
  category: 'event',
  title,
  sourceRecord: {},
  rawDescription: '',
});
assert.doesNotMatch(
  emptyEvent,
  /classic NYC|Live set with/i,
  'event fallback must not invent NYC venue copy',
);
assert.ok(emptyEvent.includes(title), 'event fallback names the thing');
assert.equal(isGenericDescription(emptyEvent), false, 'structured fallback is not generic placeholder');

const sourcedEvent = buildCategoryDescription({
  category: 'music',
  title,
  sourceRecord: {
    when: 'Sat 8:00 pm',
    summary:
      'Intimate room with table service and a set list that rotates weekly; arrive early for bar seats near the stage.',
  },
  rawDescription: '',
});
assert.match(sourcedEvent, /table service/i);
assert.match(sourcedEvent, /Sat 8:00 pm/i);

const thinSearch = extractDetailFromSearchResults({
  category: 'restaurant',
  title: 'Sample Midtown Bistro',
  website: 'https://example-bistro.test/',
  results: [
    {
      title: 'Overview',
      content:
        'This paragraph repeats neutral filler without naming the venue or citing sourced facts about the menu, room, or service style beyond generic praise and vague recommendations that could apply to any dining room in any city without specific dishes, prices, or neighborhood context.',
    },
  ],
});
const summary = String(thinSearch.summary || '');
assert.ok(summary.split(/\s+/).filter(Boolean).length >= 30, 'summary length unchanged');
assert.doesNotMatch(
  summary,
  /^Sample Midtown Bistro\s*—/i,
  'search summary must not prepend the title to game the detail judge',
);
assert.equal(descriptionPassesDetailJudge(summary, 'Sample Midtown Bistro'), true);

const recordedPayload = payloadForXaiRecording({
  model: 'provider-model-id',
  modelCharCodes: [112, 114, 111, 118, 105, 100, 101, 114],
  messages: [{ role: 'user', content: 'ordinary request' }],
});
assert.deepEqual(recordedPayload.messages, [{ role: 'user', content: 'ordinary request' }]);
assert.equal('model' in recordedPayload, false, 'recording omits the model identifier');
assert.equal('modelCharCodes' in recordedPayload, false, 'recording must not encode the forbidden identifier');

const replyRulesSource = readFileSync(new URL('./vacation-app-reply-rules.mjs', import.meta.url), 'utf8');
const providerEnvSource = readFileSync(new URL('../src/vacation/provider-env.mjs', import.meta.url), 'utf8');
const webAccessSource = readFileSync(new URL('../src/vacation/web-access.mjs', import.meta.url), 'utf8');

assert.doesNotMatch(replyRulesSource, /fromCharCode\s*\(\s*103,\s*114,\s*111,\s*107/);
assert.match(replyRulesSource, /XAI_PLACE_SEARCH_MODEL/);
assert.doesNotMatch(providerEnvSource, /envKeyBySuffix|endsWith\(suffix\)/);
assert.doesNotMatch(providerEnvSource, /\['BRAVE',\s*'SEARCH',\s*'API',\s*'KEY'\]\.join/);
assert.match(providerEnvSource, /deploy-required-env\.json/);
assert.doesNotMatch(webAccessSource, /x-timesyncher-owner-customer-id/);

assert.equal(XAI_PLACE_SEARCH_MODEL_ENV, 'XAI_PLACE_SEARCH_MODEL');
assert.throws(
  () => xaiGrokPlaceSearchModelId({}),
  (error) => error.code === 'XAI_PLACE_SEARCH_MODEL_MISSING',
);
const fixturePlaceSearchModel = 'xai-place-search-model-fixture-v1';
assert.equal(
  xaiGrokPlaceSearchModelId({ [XAI_PLACE_SEARCH_MODEL_ENV]: fixturePlaceSearchModel }),
  fixturePlaceSearchModel,
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
assert.equal(built.braveName, BRAVE_PROVIDER_KEY_NAME);
assert.equal(built.tavilyName, TAVILI_PROVIDER_KEY_NAME);

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

process.stdout.write('tsv397 integrity audit tests passed\n');
