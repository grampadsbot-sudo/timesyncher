#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import { mergeBotPrimaryPresentedFields } from '../src/vacation/dossier-bot-primary-seed.mjs';
import { mergeDossierForPersistence } from '../src/vacation/thing-evidence-dossier.mjs';

const page = (url, text) => ({ url, text, fetchedAt: '2026-10-31T00:00:00.000Z', sha256: createHash('sha256').update(text).digest('hex') });
const persisted = {
  thing: 'Bar',
  pages: [page('https://a.example/', 'Alpha page about the bar and its hours.'), page('https://b.example/', 'Bravo page with the menu list.'), page('https://c.example/', 'Charlie page with old text.')],
  fields: {},
};
const bot = {
  thing: 'Bar',
  pages: [page('https://c.example/', 'The fries and smash burger are delish and the staff is great.'), page('https://d.example/', 'Cozy room, date friendly, a bit expensive.')],
  fields: {},
  reviews: [
    { text: 'r1', representative: true, claims: [{ text: 'fries and smash burger are delish', pages: ['p1'], supported: true }] },
    { text: 'r2', representative: true, claims: [{ text: 'date friendly', pages: ['p2'], supported: true }] },
  ],
};
const textOf = (d, id) => d.pages[Number(String(id).slice(1)) - 1]?.text || '';
const seeded = mergeBotPrimaryPresentedFields(persisted, bot, { title: 'Bar' });
for (const review of seeded.reviews) {
  for (const claim of review.claims) assert.ok(textOf(seeded, claim.pages[0]).includes(claim.text), JSON.stringify(claim));
}
const saved = mergeDossierForPersistence(persisted, seeded);
for (const review of saved.reviews) {
  for (const claim of review.claims) assert.ok(textOf(saved, claim.pages[0]).includes(claim.text), JSON.stringify(claim));
}
console.log('bot seed review claim remap ok');
