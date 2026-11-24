import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { renderOnboardingWelcome } from '../src/vacation/onboarding-welcome.mjs';

const FIXTURE_SITE = 'https://vacation.example.test/shared/intake-fixture000001/';
const source = await readFile(new URL('../public/vacation-app-request.js', import.meta.url), 'utf8');
const sandbox = { window: { location: { href: 'https://vacation.example.test/vacation-app.html' }, navigator: { userAgent: '' }, fetch: async () => ({}), addEventListener() {} }, document: {}, navigator: {}, console, URL, setTimeout, clearTimeout };
vm.runInNewContext(source, sandbox);
const welcome = sandbox.window.tsVacationAppWelcome;
assert.ok(welcome, 'tsVacationAppWelcome loaded');

const safe = (value) => String(value || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const visible = (html) => html.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#39;/g, "'");

const ua = {
  iphoneSafari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
  ipadSafari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
  iphoneChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0.6778.73 Mobile/15E148 Safari/604.1',
  android: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
  macSafari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
  desktopChrome: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
};
assert.equal(welcome.isIosSafari({ userAgent: ua.iphoneSafari }), true);
assert.equal(welcome.isIosSafari({ userAgent: ua.ipadSafari, maxTouchPoints: 5 }), true);
assert.equal(welcome.isIosSafari({ userAgent: ua.iphoneSafari, standalone: true }), false);
for (const key of ['iphoneChrome', 'android', 'macSafari', 'desktopChrome']) {
  assert.equal(welcome.isIosSafari({ userAgent: ua[key], maxTouchPoints: 0 }), false, key);
}

const cases = [
  ['owner', { audience: 'owner', firstName: 'Avery', tripSiteUrl: FIXTURE_SITE }, 'your vacation already has its own website'],
  ['collaborator', { audience: 'collaborator', collabFirstName: 'Sam', ownerFirstName: 'Avery', tripTitle: 'Fixture Bay', tripSiteUrl: FIXTURE_SITE }, "Here's the vacation website"],
];
for (const [label, input, phrase] of cases) {
  const text = renderOnboardingWelcome(input);
  assert.ok(text.includes(FIXTURE_SITE), `${label}: stored welcome text keeps the link`);
  for (const ios of [false, true]) {
    const html = welcome.turnHtml(text, safe, { ios });
    const anchor = html.match(/<a class="chat-link welcome-site-link" href="([^"]+)"[^>]*>([^<]+)<\/a>/);
    assert.ok(anchor, `${label}: welcome has a link`);
    assert.equal(anchor[1], FIXTURE_SITE, `${label}: link goes to the vacation website`);
    assert.equal(visible(anchor[2]), phrase, `${label}: the phrase is the link text`);
    assert.ok(!visible(html).includes(FIXTURE_SITE), `${label}: raw URL is not visible`);
    assert.ok(!visible(html).includes('/shared/'), `${label}: /shared/ path is not visible`);
    assert.equal(html.includes(welcome.HOME_SCREEN_TIP), ios, `${label}: home-screen tip only on iOS Safari`);
  }
}

for (const audience of ['owner_no_site', 'collaborator_no_site']) {
  const text = renderOnboardingWelcome({ audience, firstName: 'Avery', collabFirstName: 'Sam', ownerFirstName: 'Avery', tripTitle: 'Fixture Bay' });
  assert.equal(welcome.isWelcome(text), true, `${audience} is a welcome`);
  assert.equal(welcome.turnHtml(text, safe, { ios: true }).includes(welcome.HOME_SCREEN_TIP), true, `${audience} tip on iOS Safari`);
  assert.equal(welcome.turnHtml(text, safe, { ios: false }), safe(text), `${audience} unchanged elsewhere`);
}

const reply = `Here is the plan. Your website is ${FIXTURE_SITE} and the vacation website: ${FIXTURE_SITE}`;
assert.equal(welcome.turnHtml(reply, safe, { ios: true }), safe(reply), 'other chat turns are untouched');

const page = await readFile(new URL('../vacation-app.html', import.meta.url), 'utf8');
assert.match(page, /window\.tsVacationAppWelcome\.turnHtml\(turn\.body, chatText, \{ welcome \}\)/);
const emails = await readFile(new URL('../content/onboarding-welcome.json', import.meta.url), 'utf8');
assert.ok(!emails.includes(welcome.HOME_SCREEN_TIP), 'tip is not in stored welcome templates');
console.log('test_welcome_site_link_chat ok');
