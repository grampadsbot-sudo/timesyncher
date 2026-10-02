import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const vacationApp = await readFile(new URL('../vacation-app.html', import.meta.url), 'utf8');
const inviteJs = await readFile(new URL('../public/vacation-app-collaborator-invite.js', import.meta.url), 'utf8');
const sendBlock = vacationApp.slice(vacationApp.indexOf('async function sendMessage'), vacationApp.indexOf('function filePayload'));

assert.match(inviteJs, /tsVacationAppRequest/);
assert.match(vacationApp, /tsVacationAppRequest missing/);
assert.doesNotMatch(vacationApp, /tsVacationAppRequest \|\| \{\}/);
assert.match(inviteJs, /customerSafeErrorMessage/);
assert.match(sendBlock, /showComposerStatus/);
assert.match(sendBlock, /failAppRequest/);
assert.match(vacationApp, /id="composerStatus"/);
assert.doesNotMatch(sendBlock, /bubble.*error\.message/);
assert.doesNotMatch(sendBlock, /<article class="bubble"><small>TimeSyncher<\/small><span class="error">/);

const indexPage = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const eulaText = await readFile(new URL('../src/onboarding/current-eula-text.mjs', import.meta.url), 'utf8');
assert.doesNotMatch(indexPage, /unlimitedName">unlimited</i);
assert.doesNotMatch(indexPage, /bumpTitle">unlimited</i);
assert.doesNotMatch(indexPage, /\|\|\s*'unlimited'/);
assert.doesNotMatch(eulaText, /Plan unlimited is the order bump/i);

console.log('vacation app client errors passed');
