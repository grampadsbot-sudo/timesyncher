import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { purchaseEmail } from '../src/vacation/email.mjs';
import { isPurchaseEntry, openAppHref, successHref } from '../public/post-purchase-gate.mjs';

const orderSuccess = await readFile(new URL('../order-success.html', import.meta.url), 'utf8');
const sharedApp = await readFile(new URL('../shared-app.html', import.meta.url), 'utf8');
const gate = await readFile(new URL('../public/post-purchase-gate.mjs', import.meta.url), 'utf8');
const accessCheckout = await readFile(new URL('../access-checkout.html', import.meta.url), 'utf8');

assert.match(orderSuccess, /Check your email and click the link in that email/i);
assert.match(orderSuccess, /id="openApp"/);
assert.match(orderSuccess, /id="purchaseLink"/);
assert.match(orderSuccess, /\/vacation-app\.html\?session=/);
assert.doesNotMatch(orderSuccess, /href="\/shared\//);
assert.doesNotMatch(orderSuccess, /id="acceptEula"/);
assert.doesNotMatch(orderSuccess, /\/accept\//);

assert.match(sharedApp, /post-purchase-gate\.mjs/);
assert.match(gate, /id = 'eulaScreen'/);
assert.match(gate, /id = 'eulaAgreeButton'/);
assert.match(gate, /id = 'eulaAgree'/);
assert.match(gate, /Review Terms & Privacy/);
assert.match(gate, /successHref\(loc\.pathname, loc\.search\)/);
const agreeAt = gate.indexOf("form.addEventListener('submit'");
const successAt = gate.indexOf('successHref(loc.pathname, loc.search)');
assert.ok(agreeAt > 0 && successAt > agreeAt);

assert.equal(isPurchaseEntry('/shared/example/', '?purchase=1'), true);
assert.equal(isPurchaseEntry('/shared/example/', ''), false);
assert.equal(isPurchaseEntry('/shared/', ''), true);
assert.equal(isPurchaseEntry('/shared/example/journey', ''), false);
assert.equal(isPurchaseEntry('/shared/', '?app=1'), false);
assert.equal(openAppHref('/shared/example/', '?purchase=1&test=1&session=example-session'), '/vacation-app.html?session=example-session');
assert.equal(openAppHref('/shared/', '?purchase=1&eulaSession=vacation-example-session'), '/vacation-app.html?session=example-session');
assert.throws(() => openAppHref('/shared/', '?purchase=1'), /Vacation app session is missing/);
assert.equal(
  successHref('/shared/example/', '?purchase=1&test=1&eulaSession=vacation-example-session'),
  '/order-success.html?eula=accepted&session=example-session&open=%2Fvacation-app.html%3Fsession%3Dexample-session&test=1',
);
assert.doesNotMatch(successHref('/shared/intake-abc/', '?purchase=1&session=example-session'), /\/shared\/intake-/);

const email = purchaseEmail({
  contact: { firstName: 'Alex' },
  sessionToken: 'example-session',
  env: { TIMESYNCHER_SITE_BASE_URL: 'https://vacation-staging.timesyncher.com' },
});
assert.equal(email.launchUrl, 'https://vacation-staging.timesyncher.com/vacation-app.html?session=example-session');
assert.doesNotMatch(email.launchUrl, /\/shared\/intake-/);
assert.match(email.htmlBody, /vacation-app\.html\?session=example-session/);
assert.doesNotMatch(`${email.textBody}\n${email.htmlBody}`, /order-success|\/accept\//i);

assert.match(accessCheckout, /\/shared\/\?purchase=1&accessPlanCheckout=complete/);
assert.doesNotMatch(accessCheckout, /order-success\.html\?accessPlanCheckout=complete/);

console.log('post-purchase eula open app passed');
