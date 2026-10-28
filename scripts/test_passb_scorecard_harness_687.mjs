#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  assertPassbPresentedBar,
  formatPassbScorecardAscii,
  scorePassbFixtureRows,
} from '../src/vacation/passb-scorecard.mjs';
import {
  buildPassbScorecardGoodFixture,
  buildPassbScorecardUnderBarFixture,
} from './fixtures/passb-scorecard-fixtures.mjs';

const goodFixture = buildPassbScorecardGoodFixture();
const good = scorePassbFixtureRows(goodFixture.rows, goodFixture);
assert.match(formatPassbScorecardAscii(good), /restaurant/);
assert.equal(assertPassbPresentedBar(good).ok, true);

const underFixture = buildPassbScorecardUnderBarFixture();
const under = scorePassbFixtureRows(underFixture.rows, underFixture);
assert.equal(assertPassbPresentedBar(under).ok, false);

const root = fileURLToPath(new URL('..', import.meta.url));
const goodRun = spawnSync('node', ['scripts/passb-scorecard-run.mjs'], { cwd: root, encoding: 'utf8' });
assert.equal(goodRun.status, 0, goodRun.stderr || goodRun.stdout);
const badRun = spawnSync('node', ['scripts/passb-scorecard-run.mjs'], {
  cwd: root,
  encoding: 'utf8',
  env: { ...process.env, PASSB_SCORECARD_FIXTURE: 'under-bar' },
});
assert.notEqual(badRun.status, 0);

console.log('test_passb_scorecard_harness_687: ok');
