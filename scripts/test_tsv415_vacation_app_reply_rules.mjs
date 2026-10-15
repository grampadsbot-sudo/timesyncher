#!/usr/bin/env node
import assert from 'node:assert/strict';

import { xaiGrokPlaceSearchModelId } from './vacation-app-reply-rules.mjs';

const placeSearchModelEnv = 'XAI_PLACE_SEARCH_MODEL';

assert.throws(
  () => xaiGrokPlaceSearchModelId({}),
  (error) => error.code === 'XAI_PLACE_SEARCH_MODEL_MISSING',
  'place search model must come from env, not a hidden default',
);

const fixturePlaceSearchModel = 'xai-place-search-model-fixture-v1';
assert.equal(
  xaiGrokPlaceSearchModelId({ [placeSearchModelEnv]: fixturePlaceSearchModel }),
  fixturePlaceSearchModel,
  'configured place search model is used verbatim',
);

process.stdout.write('tsv415 vacation-app-reply-rules tests passed\n');
