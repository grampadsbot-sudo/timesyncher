import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const page = await readFile(new URL('../vacation-app.html', import.meta.url), 'utf8');
assert.match(page, /TimeSyncher Vacation App/);
assert.match(page, /id="splitter"/);
assert.match(page, /class="trip-list"/);
assert.match(page, /type="file"/);
assert.match(page, /SpeechRecognition|webkitSpeechRecognition/);
assert.match(page, /\/api\/vacation-app\?session=/);
assert.match(page, /<iframe title=/);

const api = await readFile(new URL('../api/vacation-app.mjs', import.meta.url), 'utf8');
assert.match(api, /loadVacations/);
assert.match(api, /queueWebTurn/);
assert.match(api, /vacation-app/);
assert.match(api, /worker_jobs/);
assert.match(api, /transcript_turns/);
assert.match(api, /classifyTurn/);
assert.match(api, /publicTripUrl/);

const vite = await readFile(new URL('../vite.config.mjs', import.meta.url), 'utf8');
assert.match(vite, /vacationApp/);
assert.match(vite, /vacation-app\.html/);

console.log('vacation app shell regression passed');
