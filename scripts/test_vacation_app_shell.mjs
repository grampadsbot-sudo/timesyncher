import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { purchaseEmail } from '../src/vacation/email.mjs';

const page = await readFile(new URL('../vacation-app.html', import.meta.url), 'utf8');
assert.match(page, /TimeSyncher Vacation App/);
assert.match(page, /id="splitter"/);
assert.match(page, /class="trip-list"/);
assert.match(page, /type="file"/);
assert.match(page, /SpeechRecognition|webkitSpeechRecognition/);
assert.match(page, /\/api\/vacation-itinerary\?app=1&session=/);
assert.match(page, /<iframe title=/);
assert.match(page, /state\.turns/);
assert.match(page, /browserTranscription/);
assert.match(page, /MAX_INLINE_FILE_BYTES/);
assert.match(page, /FileReader/);
assert.match(page, /\/timesyncher-logo-gold\.png/);
assert.match(page, /alt="TimeSyncher"/);
assert.match(page, /no vacations yet/);
assert.match(page, /workspace\.chat-only/);
assert.match(page, /realSiteUrl/);
assert.doesNotMatch(page, /class="mark"[^>]*>TS</);
assert.match(page, /id="attachButton"[\s\S]*id="messageText"[\s\S]*id="voiceButton"[\s\S]*class="send-button"/);
assert.doesNotMatch(page, /title="Voice mode"/);

const api = await readFile(new URL('../api/vacation-itinerary.mjs', import.meta.url), 'utf8');
assert.match(api, /handleVacationApp/);
assert.match(api, /loadVacationAppTrips/);
assert.match(api, /loadVacationAppTurns/);
assert.match(api, /queueVacationAppTurn/);
assert.match(api, /vacation-app/);
assert.match(api, /worker_jobs/);
assert.match(api, /transcript_turns/);
assert.match(api, /classifyTurn/);
assert.match(api, /publicTripUrl/);
assert.match(api, /builtVacationSiteUrl/);
assert.match(api, /contentDataUrl/);

const vite = await readFile(new URL('../vite.config.mjs', import.meta.url), 'utf8');
assert.match(vite, /vacationApp/);
assert.match(vite, /vacation-app\.html/);

const onboarding = await readFile(new URL('../src/vacation/onboarding.mjs', import.meta.url), 'utf8');
assert.match(onboarding, /vacationAppLink/);
assert.match(onboarding, /in_app_text_voice_and_file_intake/);

const orderSuccess = await readFile(new URL('../order-success.html', import.meta.url), 'utf8');
assert.match(orderSuccess, /Open Your Vacation App/);
assert.match(orderSuccess, /vacation_app_open/);
assert.match(orderSuccess, /Open TimeSyncher Vacation/);
assert.doesNotMatch(orderSuccess, /telegram|telegraph/i);

const confirmed = purchaseEmail({
  contact: { firstName: 'Alex' },
  token: 'session-token',
  env: { TIMESYNCHER_SITE_BASE_URL: 'https://vacation-staging.timesyncher.com' },
});
assert.match(confirmed.textBody, /Start TimeSyncher Vacation: https:\/\/vacation-staging\.timesyncher\.com\/order-success\.html\?session=/);
assert.match(confirmed.htmlBody, /Start TimeSyncher Vacation/);
assert.doesNotMatch(`${confirmed.subject}\n${confirmed.textBody}\n${confirmed.htmlBody}`, /telegram|telegraph/i);

const orderTest = await readFile(new URL('../order-test.html', import.meta.url), 'utf8');
assert.match(orderTest, /\/api\/checkout-coupon/);
assert.doesNotMatch(orderTest, /fetch\('\/api\/create-payment-intent'[\s\S]{0,400}Redeeming coupon/);

console.log('vacation app shell regression passed');
