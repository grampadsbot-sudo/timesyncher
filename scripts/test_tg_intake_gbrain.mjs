import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  INITIAL_BUILD_CUE,
  formatIntakePage,
  intakeTurnSlug,
  persistIntakeTurnToGbrain,
} from '../src/vacation/tg-intake-gbrain.mjs';
import { vacationIdentityAck } from '../api/vacation-telegram-turn.mjs';

assert.equal(INITIAL_BUILD_CUE, "I'm building your initial itinerary now and it may take 10–15 minutes.");
assert.match(
  vacationIdentityAck({ vacationName: 'Hawaii 2026', text: 'Hawaii 2026 seven nights in Oahu', queued: { id: '1' } }),
  /I'm building your initial itinerary now and it may take 10–15 minutes/,
);

const slug = intakeTurnSlug({ telegramChatId: '123', inboundTranscriptId: 'turn-a' });
assert.equal(slug, 'bot-admin/messages/time-syncher/tg-intake/123/turn-a');

const page = formatIntakePage({
  prompt: 'Hawaii 2026 — Waikiki, seven nights',
  response: INITIAL_BUILD_CUE,
  queued: true,
  vacationName: 'Hawaii 2026',
  telegramChatId: '123',
  inboundTranscriptId: 'turn-a',
});
assert.match(page, /## Customer/);
assert.match(page, /Hawaii 2026 — Waikiki/);
assert.match(page, /10–15 minutes/);

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ts-gbrain-'));
const written = persistIntakeTurnToGbrain({
  prompt: 'Hawaii 2026 — Waikiki, seven nights',
  response: INITIAL_BUILD_CUE,
  queued: true,
  telegramChatId: '123',
  inboundTranscriptId: 'turn-a',
}, { TIMESYNCHER_PRODUCT_GBRAIN_ROOT: root });
assert.equal(written.ok, true);
assert.equal(written.slug, slug);
assert.ok(fs.existsSync(path.join(root, `${slug}.md`)));

const turnSrc = fs.readFileSync(new URL('../api/vacation-telegram-turn.mjs', import.meta.url), 'utf8');
assert.match(turnSrc, /persistIntakeTurnToGbrain/);
assert.match(turnSrc, /INITIAL_BUILD_CUE/);

console.log('tg intake gbrain track + build-cue tests passed');
