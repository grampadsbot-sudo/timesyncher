#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const queueSource = fs.readFileSync(new URL('../routes/vacation-app-chat-queue.mjs', import.meta.url), 'utf8');

assert.match(queueSource, /placeSearch: customerLive\.placeSearch \?\? payload\.placeSearch/);
assert.match(queueSource, /return \{\s*\n\s*\.\.\.base,\s*\n\s*ok: true,\s*\n\s*status: 'interim'/);
assert.match(queueSource, /vacationAppReplyFailureTurnReturn/);

console.log('test_vacation_app_interim_place_search: ok');
