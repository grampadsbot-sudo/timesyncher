#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import {
  HOURS_NOT_FOUND,
  NO_HAPPY_HOUR_FOUND,
  pickHoursFieldCandidate,
} from '../src/vacation/dossier-hours-fields.mjs';
import {
  applyDossierFields,
  prepareDossierFindings,
} from '../src/vacation/thing-dossier-fields.mjs';

function page(url, text, fetchedAt = '2026-10-22T12:00:00.000Z') {
  const body = text.trim();
  return {
    url,
    fetchedAt,
    text: body,
    sha256: createHash('sha256').update(body).digest('hex'),
  };
}

const official = page('https://carbone.example/menu', 'Happy hour Mon–Fri 4–6pm with $1 oysters. Open Mon–Sat 11:30am–11pm.', '2026-10-23T08:00:00.000Z');
const yelp = page('https://yelp.example/carbone', 'Happy hour Tue–Thu 5–7pm. Hours daily noon–midnight.', '2026-10-20T08:00:00.000Z');
const dossier = { thing: 'Carbone', pages: [official, yelp], attempts: [] };

const conflictFindings = {
  hoursCandidates: [
    {
      value: 'Mon–Sat 11:30am–11pm',
      claims: [{ text: 'open Mon–Sat 11:30am–11pm', pages: ['p1'], supported: true }],
    },
    {
      value: 'Daily noon–midnight',
      claims: [{ text: 'hours daily noon–midnight', pages: ['p2'], supported: true }],
    },
  ],
  happyHourDays: { value: 'Mon–Fri', claims: [{ text: 'happy hour Mon–Fri', pages: ['p1'], supported: true }] },
  happyHourTimes: { value: '4–6pm', claims: [{ text: '4–6pm happy hour', pages: ['p1'], supported: true }] },
  happyHourDeals: { value: '$1 oysters', claims: [{ text: '$1 oysters at happy hour', pages: ['p1'], supported: true }] },
};

const { chosen, conflictNote } = pickHoursFieldCandidate(dossier, conflictFindings.hoursCandidates, {
  officialUrl: official.url,
});
assert.equal(chosen?.value, 'Mon–Sat 11:30am–11pm', 'official site wins over conflicting third-party hours');
assert.match(conflictNote, /Conflicting hours sources/i);

const built = prepareDossierFindings(dossier, conflictFindings);
assert.match(built.fields.hours.value, /Mon–Sat 11:30am–11pm/);
assert.match(built.fields.hours.value, /Conflicting hours sources/);
assert.equal(built.fields.happyHourDays.value, 'Mon–Fri');
assert.match(built.fields.happyHourDetails.value, /\$1 oysters/);

const record = applyDossierFields({ category: 'restaurant' }, built);
assert.equal(record.happyHour, true);
assert.equal(record.happyHourTimes, '4–6pm');
assert.ok(!record.missingFields.includes('happyHourDetails'));

const noHappy = prepareDossierFindings(dossier, { happyHourFound: false });
assert.equal(noHappy.fields.happyHourDetails.value, NO_HAPPY_HOUR_FOUND);
assert.equal(noHappy.fields.happyHour.value, false);
const noHappyRecord = applyDossierFields({ category: 'restaurant', missingFields: ['happyHourDetails'] }, noHappy);
assert.equal(noHappyRecord.happyHourDetails, NO_HAPPY_HOUR_FOUND);
assert.equal(noHappyRecord.happyHour, false);
assert.ok(!noHappyRecord.missingFields.includes('happyHourDetails'));

const noHours = prepareDossierFindings(dossier, { happyHourFound: false });
assert.equal(noHours.fields.hours.value, HOURS_NOT_FOUND);
const noHoursRecord = applyDossierFields({ missingFields: ['hours'] }, noHours);
assert.equal(noHoursRecord.hours, HOURS_NOT_FOUND);
assert.ok(noHoursRecord.missingFields.includes('hours'), 'Hours not found remains a reported gap');

console.log('test_dossier_hours_happy_hour: ok');
