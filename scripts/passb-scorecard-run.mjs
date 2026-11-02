#!/usr/bin/env node
import {
  assertPassbPresentedBar,
  formatPassbScorecardAscii,
  scorePassbFixtureRows,
} from '../src/vacation/passb-scorecard.mjs';
import {
  buildPassbScorecardGoodFixture,
  buildPassbScorecardUnderBarFixture,
} from './fixtures/passb-scorecard-fixtures.mjs';

const mode = String(process.env.PASSB_SCORECARD_FIXTURE || 'good').trim().toLowerCase();
const fixture = mode === 'under-bar'
  ? buildPassbScorecardUnderBarFixture()
  : buildPassbScorecardGoodFixture();

const scorecard = scorePassbFixtureRows(fixture.rows, {
  placesById: fixture.placesById,
  dossiersByPlaceId: fixture.dossiersByPlaceId,
});
console.log(formatPassbScorecardAscii(scorecard));
const verdict = assertPassbPresentedBar(scorecard);
if (!verdict.ok) {
  console.error(verdict.message);
  process.exit(1);
}
console.log('passb-scorecard: ok');
