import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AIRLINE_SITES, resolveAirlineLogo } from './fixture_airline_logos.mjs';

const site = AIRLINE_SITES.Southwest;
const logo = new URL('/declared.png', site).href;
const response = (body, status = 200, type = 'text/html', headers = {}) => new Response(body, { status, headers: { 'content-type': type, ...headers } });
function stub(routes) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    assert.ok(Object.hasOwn(routes, url), `Unexpected fetch: ${url}`);
    const route = routes[url];
    return typeof route === 'function' ? route(options) : response(...route);
  };
  return { calls, fetchImpl };
}

test('map and case-insensitive airline names/sites resolve a declared, verified icon', async () => {
  assert.deepEqual(Object.keys(AIRLINE_SITES), ['Southwest', 'JetBlue', 'Delta', 'American']);
  for (const input of ['Southwest', 'SOUTHWEST AIRLINES', 'southwest.com', site]) {
    const fetch = stub({ [site]: ['<link href="/declared.png" rel="shortcut icon">'], [logo]: ['bytes', 200, 'image/png'] });
    assert.deepEqual(await resolveAirlineLogo(input, fetch), { logo, source: site, verified: true, reason: '' });
    assert.equal(fetch.calls[1].options.headers.accept, 'image/*');
  }
});

test('403 or 429 gets one backoff and browser-UA retry on page or icon', async () => {
  for (const status of [403, 429]) for (const target of [site, logo]) {
    let attempts = 0;
    const delays = [];
    const fetch = stub({
      [site]: () => response('<link rel="icon" href="/declared.png">', target === site && attempts++ === 0 ? status : 200),
      [logo]: () => response('bytes', target === logo && attempts++ === 0 ? status : 200, 'image/png'),
    });
    const result = await resolveAirlineLogo('Southwest', { ...fetch, sleepImpl: async (ms) => delays.push(ms) });
    assert.equal(result.verified, true);
    assert.deepEqual(delays, [1000]);
    assert.equal(fetch.calls.filter((call) => call.url === target).length, 2);
    assert.ok(fetch.calls.every(({ options }) => options.headers['user-agent'].includes('Mozilla/5.0')));
  }
});

test('non-image or missing content-type is blank and flagged', async () => {
  for (const type of ['text/html', '', 'image/png-invalid text']) {
    const fetch = stub({ [site]: ['<link rel="icon" href="/declared.png">'], [logo]: ['challenge', 200, type] });
    assert.deepEqual(await resolveAirlineLogo(site, fetch), { logo: '', source: site, verified: false, reason: 'airline_logo_unverified:icon_non_image_content_type' });
  }
});

test('no declaration never guesses favicon.ico or accepts commented/script examples', async () => {
  const fetch = stub({ [site]: ['<!-- <link rel="icon" href="/fake.png"> --><script>const sample = `<link rel="icon" href="/fake.png">`</script>'] });
  const result = await resolveAirlineLogo(site, fetch);
  assert.deepEqual(result, { logo: '', source: site, verified: false, reason: 'airline_logo_unverified:no_declared_icon' });
  assert.equal(fetch.calls.length, 1);
});

test('linked manifest resolves icons relative to its redirected URL and verifies bytes', async () => {
  const manifest = new URL('/app/manifest.json', site).href;
  const finalManifest = new URL('/assets/manifest.json', site).href;
  const image = new URL('/assets/logo.png', site).href;
  const fetch = stub({
    [site]: ['<link rel=manifest href=/app/manifest.json>'],
    [manifest]: ['', 302, 'text/html', { location: finalManifest }],
    [finalManifest]: [JSON.stringify({ icons: [{ src: 'logo.png' }] }), 200, 'application/manifest+json'],
    [image]: ['bytes', 200, 'image/png'],
  });
  assert.deepEqual(await resolveAirlineLogo(site, fetch), { logo: image, source: finalManifest, verified: true, reason: '' });
});

test('relative apple-touch-icon honors base and HTML entities, with a later usable candidate', async () => {
  const image = new URL('/assets/touch.png?v=1&x=2', site).href;
  const fetch = stub({
    [site]: ["<base href='/assets/'><link REL='ICON' href='/declared.png'><link href='touch.png?v=1&amp;x=2' rel='apple-touch-icon'>"],
    [logo]: ['missing', 404, 'image/png'],
    [image]: ['bytes', 200, 'image/png; charset=binary'],
  });
  assert.equal((await resolveAirlineLogo(site, fetch)).logo, image);
});

test('persistent 403 stops after one retry and reports status', async () => {
  const fetch = stub({ [site]: ['denied', 403] });
  const delays = [];
  const result = await resolveAirlineLogo(site, { ...fetch, sleepImpl: async (ms) => delays.push(ms) });
  assert.equal(result.reason, 'airline_logo_unverified:page_http_403');
  assert.equal(result.logo, '');
  assert.equal(result.verified, false);
  assert.equal(fetch.calls.length, 2);
  assert.equal(delays.length, 1);
});

test('requires HTTP 200 even for an image response', async () => {
  const fetch = stub({ [site]: ['<link rel="icon" href="/declared.png">'], [logo]: ['partial', 206, 'image/png'] });
  const result = await resolveAirlineLogo(site, fetch);
  assert.equal(result.logo, '');
  assert.equal(result.reason, 'airline_logo_unverified:icon_http_206');
});

test('unknown airlines and lookalike domains never fetch', async () => {
  for (const input of ['Unknown', 'southwest.com.evil.example', 'https://southwest.com@evil.example', 'https://evil.example/']) {
    const result = await resolveAirlineLogo(input, { fetchImpl: () => assert.fail('unexpected fetch') });
    assert.equal(result.reason, 'airline_logo_unverified:unknown_airline');
    assert.equal(result.verified, false);
  }
});

test('disallowed providers and page redirects cannot supply logos', async () => {
  const fetch = stub({ [site]: ['<link rel="icon" href="https://www.google.com/s2/favicons?domain=southwest.com"><link rel="icon" href="https://x.gstatic.com/a.png"><link rel="icon" href="https://vacation-staging.timesyncher.com/a.png">'] });
  assert.equal((await resolveAirlineLogo(site, fetch)).logo, '');
  assert.equal(fetch.calls.length, 1);
  const redirected = stub({ [site]: ['', 302, 'text/html', { location: 'https://other.example/' }] });
  assert.match((await resolveAirlineLogo(site, redirected)).reason, /disallowed_url/);
  assert.equal(redirected.calls.length, 1);
});

test('network and malformed manifest failures are flagged, never thrown', async () => {
  const network = await resolveAirlineLogo(site, { fetchImpl: async () => { throw new Error('network_down'); } });
  assert.equal(network.reason, 'airline_logo_unverified:page_fetch_failed:network_down');
  const manifest = new URL('/manifest.json', site).href;
  const fetch = stub({ [site]: ['<link rel="manifest" href="/manifest.json">'], [manifest]: ['invalid JSON'] });
  assert.equal((await resolveAirlineLogo(site, fetch)).reason, 'airline_logo_unverified:manifest_fetch_or_parse_failed');
});

test('declared CDN image redirects are verified at their final URL', async () => {
  const cdn = 'https://airline-assets.example/logo.png';
  const fetch = stub({
    [site]: ['<link rel="icon" href="/declared.png">'],
    [logo]: ['', 302, 'text/html', { location: cdn }],
    [cdn]: ['bytes', 200, 'image/png'],
  });
  assert.deepEqual(await resolveAirlineLogo(site, fetch), { logo: cdn, source: site, verified: true, reason: '' });
});
