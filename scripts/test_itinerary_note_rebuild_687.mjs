#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { dossierFillRebuildFields, dossierPersistedFillIsNoOp } from '../src/vacation/xai-dossier-fill-state.mjs';
import { computeDossierFieldHashes } from '../src/vacation/thing-dossier-fields.mjs';

const place = { id: 'note-rebuild', title: 'Harbor Bookshop', name: 'Harbor Bookshop', category: 'store' };
const summary = 'Harbor Bookshop offers a quiet place to browse local history books and staff selections by the harbor.';
const description = 'Harbor Bookshop stocks local history books, fiction, and maps in a small shop beside the harbor. Staff selections help visitors choose books about the surrounding area. The shop has a quiet reading corner and shelves of travel guides, with books arranged by subject for browsing during a visit.';
const claim = () => ({ text: 'Harbor Bookshop stocks local history books.', pages: ['p1'], supported: true });
const field = (value) => ({ value, claims: [claim()] });
const text = `${summary} ${description}`;
const evidence = {
  url: 'https://bookshop.example/about', text, fetchedAt: '2026-10-26T12:00:00.000Z',
  sha256: createHash('sha256').update(text).digest('hex'),
};
const dossier = {
  thing: place.title, pages: [evidence],
  attempts: [{ kind: 'page', url: evidence.url, status: 'ok', startedAt: evidence.fetchedAt }],
  fields: { summary: field(summary), description: field(description) },
  captureCheckpoint: 'done',
};
const { hashes, sources } = computeDossierFieldHashes(dossier);
const persisted = { ...dossier, fieldHashes: hashes, fieldSources: sources };

const rebuild = dossierFillRebuildFields(persisted, persisted, place);
assert.ok(rebuild.has('itineraryNote'), 'missing itineraryNote must be in rebuildFields');
assert.equal(rebuild.has('summary'), false, 'good summary must not force summary rebuild');
assert.equal(dossierPersistedFillIsNoOp(persisted, persisted, place), false, 'missing itineraryNote is not a no-op');

const withNote = {
  ...persisted,
  fields: { ...persisted.fields, itineraryNote: field('Quiet harbor bookshop — browse the local history shelf.') },
};
const hashed = computeDossierFieldHashes(withNote);
const complete = { ...withNote, fieldHashes: hashed.hashes, fieldSources: hashed.sources };
const rebuildDone = dossierFillRebuildFields(complete, complete, place);
assert.equal(rebuildDone.has('itineraryNote'), false, 'present itineraryNote stays out of rebuildFields');
console.log('test_itinerary_note_rebuild_687: ok');
