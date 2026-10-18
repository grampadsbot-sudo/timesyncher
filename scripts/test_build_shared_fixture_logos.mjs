import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildFixture, encode, recordedFetch } from './build_shared_fixture_logos.mjs';

const site = 'https://venue.example/';
const logo = 'https://venue.example/declared.png';
const sourceUrl = 'https://vacation-staging.timesyncher.com/api/shared/public-test';
const asOf = '2026-10-17T22:15:00Z';
const place = (id, name = 'Venue', category_name = 'Restaurant') => ({ id, name, category_name, website: '' });
const shared = (id, places) => ({ trip: { id }, places, thingOverrides: { 'place:1': { timeline: true } }, days: [{ id: 1 }] });
const fixture = () => shared(1, [place(1)]);
const staging = () => shared(99, [{ ...place(601), website: site, logoUrl: 'https://guessed.example/favicon.ico', description: 'must not copy' }]);
function http(url, options) {
  if (String(url) === site) return Promise.resolve({ ok: true, status: 200, url: site, text: async () => '<link rel="icon" href="/declared.png">', headers: new Headers({ 'content-type': 'text/html' }) });
  assert.equal(options.headers.accept, 'image/*');
  assert.equal(url, logo);
  return Promise.resolve({ ok: true, status: 200, url: logo, headers: new Headers({ 'content-type': 'image/png' }) });
}
const run = (overrides = {}) => buildFixture({ fixture: fixture(), staging: staging(), sourceUrl, asOf, fetchImpl: http, ...overrides });

test('staging website only, declared verified image, dry run then audited apply, unrelated fixture data preserved', async () => {
  const original = fixture();
  const result = await run({ fixture: original });
  assert.equal(result.matches[0].stagingId, 601);
  assert.equal(result.matches[0].method, 'normalized_name_category');
  assert.equal(result.fixture.places[0].website, site);
  assert.equal(result.fixture.places[0].logoUrl, logo);
  assert.equal(result.fixture.places[0].description, undefined);
  assert.equal(result.fixture.thingOverrides['place:1'].timeline, true);
  assert.deepEqual(result.fixture.days, [{ id: 1 }]);
  assert.equal(result.audit[0].logo, logo);
  assert.equal(result.audit[0].old, null);
  assert.equal(result.audit[0].at, asOf);
  assert.equal(result.dryRun.dryRun, true);
  assert.equal(result.applied.dryRun, false);
  assert.deepEqual(original, fixture());
});

test('recorded input replays offline with byte-identical fixture and audit', async () => {
  const recording = recordedFetch({ fetchImpl: http });
  const first = await run({ fetchImpl: recording.fetch });
  const replay = recordedFetch({ records: structuredClone(recording.records), replay: true, fetchImpl: () => assert.fail('offline replay fetched network') });
  const second = await run({ fetchImpl: replay.fetch });
  assert.equal(encode(first), encode(second));
  await assert.rejects(replay.fetch('https://missing.example/'), /Missing recorded response/);
});

test('ambiguous, unmatched, wrong category and provider-site matches remain blank with exact reasons', async () => {
  for (const [places, reason] of [
    [[{ ...place(601), website: site }, { ...place(602), website: site }], 'ambiguous_name_category'],
    [[{ ...place(601, 'Other'), website: site }], 'no_exact_match'],
    [[{ ...place(601, 'Venue', 'Hotel'), website: site }], 'no_exact_match'],
    [[{ ...place(601), website: 'https://www.wikipedia.org/Venue' }], 'matched_website_not_own_site'],
    [[place(601)], 'matched_website_empty'],
  ]) {
    const result = await run({ staging: shared(99, places), fetchImpl: () => assert.fail('missing site fetched') });
    assert.equal(result.matches[0].reason, reason);
    assert.equal(result.fixture.places[0].website, '');
    assert.equal(result.fixture.places[0].logoUrl, '');
    assert.equal(result.fixture.places[0].logoCaptureReason, 'no_verified_place_website');
    assert.equal(result.audit[0].outcome, 'unavailable');
  }
});

test('website host that does not resolve is blanked as website_host_unresolvable with no capture or override; other fetch errors keep the website', async () => {
  const dns = Object.assign(new TypeError('fetch failed'), { cause: Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' }) });
  const calls = [];
  const dead = await run({ fetchImpl: async (url, options) => { calls.push([url, options.headers.accept]); throw dns; } });
  assert.deepEqual(calls, [[site, 'text/html']]);
  assert.equal(dead.matches[0].reason, 'website_host_unresolvable');
  assert.equal(dead.matches[0].website, '');
  assert.equal(dead.fixture.places[0].website, null);
  assert.equal(dead.fixture.places[0].websiteCapture, undefined);
  assert.equal(dead.fixture.thingOverrides['place:1'].sourceRecord, undefined);
  assert.equal(dead.fixture.places[0].logoUrl, '');
  assert.equal(dead.fixture.places[0].logoCaptureReason, 'no_verified_place_website');
  const timedOut = await run({ fetchImpl: async () => { throw new Error('The operation was aborted due to timeout'); } });
  assert.equal(timedOut.matches[0].reason, '');
  assert.equal(timedOut.fixture.places[0].website, site);
  assert.equal(timedOut.fixture.places[0].logoCaptureReason, 'page_fetch_failed');
});

test('same-trip stable ids reject identity collision; independent trip ids match names and categories', async () => {
  const collision = await run({ staging: shared(1, [{ ...place(1, 'Other'), website: site }]), fetchImpl: () => assert.fail('identity collision fetched') });
  assert.equal(collision.matches[0].reason, 'stable_id_identity_conflict');
  const independent = await run({ staging: shared(99, [{ ...place(1), website: site }]) });
  assert.equal(independent.fixture.places[0].logoUrl, logo);
});

test('curly apostrophes and established category aliases normalize exactly without fuzzy matching', async () => {
  const result = await run({ fixture: shared(1, [place(1, 'Venue’s', 'Shopping')]), staging: shared(99, [{ ...place(601, "Venue's", 'Store'), website: site }]) });
  assert.equal(result.matches[0].stagingId, 601);
  assert.equal(result.matches[0].category, 'store');
  const event = await run({ fixture: shared(1, [place(1, 'Music Venue', 'Activity')]), staging: shared(99, [{ ...place(601, 'Music Venue', 'Attraction'), website: site }]) });
  assert.equal(event.matches[0].stagingId, 601);
  assert.equal(event.matches[0].category, 'event');
});

test('failed page, network error and nonimage icon cannot fill or copy staging guessed logo', async () => {
  for (const fetchImpl of [
    async () => { throw new Error('network down'); },
    async () => ({ ok: false, status: 403, url: site, text: async () => '' }),
    async (url, opts) => opts.headers.accept === 'text/html' ? http(url, opts) : { ok: true, status: 200, url: logo, headers: new Headers({ 'content-type': 'text/html' }) },
  ]) {
    const result = await run({ fetchImpl });
    assert.equal(result.fixture.places[0].logoUrl, '');
    assert.ok(['page_fetch_failed', 'page_http_403', 'no_icon_answered_with_image'].includes(result.fixture.places[0].logoCaptureReason));
    assert.equal(result.audit[0].outcome, 'unavailable');
  }
});

test('undeclared favicon guesses are never fetched even when they would return an image', async () => {
  const result = await run({ fetchImpl: async (url) => {
    assert.equal(url, site);
    return { ok: true, status: 200, url: site, text: async () => '<html>No declared icon</html>' };
  } });
  assert.equal(result.fixture.places[0].logoUrl, '');
  assert.equal(result.fixture.places[0].logoCaptureReason, 'no_icon_answered_with_image');
});

test('nonempty existing fixture logos are preserved, not audited as new or fetched', async () => {
  const existing = fixture();existing.places[0].image_url = 'https://existing.example/logo.png';
  const result = await run({ fixture: existing, fetchImpl: () => assert.fail('nonempty logo fetched') });
  assert.equal(result.fixture.places[0].image_url, 'https://existing.example/logo.png');
  assert.equal(result.applied.report[0].outcome, 'skipped_has_logo');
  assert.deepEqual(result.audit, []);
});

test('guessed favicon.ico without a declaring document is re-resolved instead of skipped_has_logo', async () => {
  const guess = `${site}favicon.ico`;
  const input = shared(1, [{ ...place(1), logoUrl: guess }]);
  const result = await run({ fixture: input, staging: shared(99, [{ ...place(1), website: site }]), fetchImpl: http });
  assert.notEqual(result.applied.report[0].outcome, 'skipped_has_logo');
  assert.equal(result.fixture.places[0].logoUrl, logo);
});

test('malformed or duplicate source ids fail instead of emitting plausible empty fixtures', async () => {
  await assert.rejects(run({ staging: {} }), /Shared response requires/);
  await assert.rejects(run({ staging: shared(99, [place(601), place(601)]) }), /unique/);
  const conflicting = fixture();conflicting.places[0].website = 'https://different.example/';
  await assert.rejects(run({ fixture: conflicting }), /Existing website conflicts/);
});

test('CLI replay writes a sibling deterministically and refuses incomplete evidence or input overwrite', async () => {
  const { mkdtemp, writeFile, readFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { spawnSync } = await import('node:child_process');
  const { createHash } = await import('node:crypto');
  const dir = await mkdtemp(join(tmpdir(), 'shared-fixture-test-'));
  try {
    const input = join(dir, 'input.json');
    const data = encode(fixture());
    await writeFile(input, data);
    const archive = { inputHash: createHash('sha256').update(data).digest('hex'), records: [
      { key: `application/json ${sourceUrl}`, status: 200, url: sourceUrl, type: 'application/json', body: encode(staging()) },
      { key: `text/html ${site}`, status: 200, url: site, type: 'text/html', body: '<link rel="icon" href="/declared.png">' },
      { key: `image/* ${logo}`, status: 200, url: logo, type: 'image/png', body: '' },
    ] };
    const recorded = join(dir, 'recorded.json');
    await writeFile(recorded, encode(archive));
    const invoke = (output, audit) => spawnSync(process.execPath, [new URL('./build_shared_fixture_logos.mjs', import.meta.url).pathname,
      '--input', input, '--output', output, '--audit', audit, '--source', sourceUrl, '--as-of', asOf, '--replay', recorded], { encoding: 'utf8' });
    for (const suffix of ['one', 'two']) {
      const result = invoke(join(dir, `${suffix}.json`), join(dir, `${suffix}-audit.json`));
      assert.equal(result.status, 0, result.stderr);
      assert.equal(JSON.parse(await readFile(join(dir, `${suffix}.json`), 'utf8')).places[0].logoUrl, logo);
    }
    assert.equal(await readFile(join(dir, 'one.json'), 'utf8'), await readFile(join(dir, 'two.json'), 'utf8'));
    assert.equal(await readFile(join(dir, 'one-audit.json'), 'utf8'), await readFile(join(dir, 'two-audit.json'), 'utf8'));
    assert.equal(invoke(input, join(dir, 'overwrite-audit.json')).status, 1);
    assert.equal(await readFile(input, 'utf8'), data);
    archive.records.pop();
    await writeFile(recorded, encode(archive));
    const missing = invoke(join(dir, 'incomplete.json'), join(dir, 'incomplete-audit.json'));
    assert.equal(missing.status, 1);
    assert.match(missing.stderr, /Incomplete replay/);
    await assert.rejects(readFile(join(dir, 'incomplete.json')), { code: 'ENOENT' });
  } finally { await rm(dir, { recursive: true, force: true }); }
});

const response = (url, status, type, body = '') => ({ status, ok: status >= 200 && status < 300, url,
  headers: new Headers({ 'content-type': type }), text: async () => body });

test('declared manifest icons resolve relative to redirected manifest, with bad candidates rejected', async () => {
  const manifest = 'https://venue.example/app.webmanifest';
  const manifestBase = 'https://cdn.example/app/manifest.json';
  const image = 'https://cdn.example/app/icon.png';
  const calls = [];
  const result = await run({ fetchImpl: async (url) => {
    calls.push(url);
    if (url === site) return response(site, 200, 'text/html', '<link rel="manifest" href="/app.webmanifest">');
    if (url === manifest) return response(manifestBase, 200, 'application/manifest+json', JSON.stringify({ icons: [
      { src: 'https://www.gstatic.com/favicon.png' }, { src: 'data:image/png,no' }, {}, { src: 'icon.png' },
    ] }));
    assert.equal(url, image);
    return response(image, 200, 'image/png');
  } });
  assert.equal(result.fixture.places[0].logoUrl, image);
  assert.deepEqual(calls, [site, manifest, image]);
  assert.equal(result.logoChecks.at(-1).type, 'image/png');
});

test('page, manifest and icon 403/429 each receive exactly one browser retry after bounded backoff', async () => {
  for (const kind of ['page', 'manifest', 'icon']) for (const status of [403, 429]) {
    const counts = new Map();
    const waits = [];
    const target = kind === 'page' ? site : kind === 'manifest' ? `${site}app.json` : logo;
    const result = await run({ sleep: async (ms) => { waits.push(ms); }, fetchImpl: async (url, options) => {
      const count = (counts.get(url) || 0) + 1; counts.set(url, count);
      if (url === target && count === 1) {
        const answer = response(url, status, 'text/html');
        answer.headers.set('retry-after', '2');
        return answer;
      }
      if (url === target) assert.match(options.headers['user-agent'], /Mozilla\/5\.0/);
      if (url === site) return response(site, 200, 'text/html', kind === 'manifest'
        ? '<link rel="manifest" href="/app.json">' : '<link rel="shortcut icon" href="/declared.png">');
      if (url === `${site}app.json`) return response(url, 200, 'application/json', JSON.stringify({ icons: [{ src: '/declared.png' }] }));
      assert.equal(url, logo); return response(logo, 200, 'image/png');
    } });
    assert.equal(result.fixture.places[0].logoUrl, logo);
    assert.deepEqual(waits, [2000]);
    assert.equal(counts.get(target), 2);
    assert.equal(result.logoChecks.filter((check) => check.url === target).length, 2);
  }
});

test('persistent forbidden and rate-limited pages stay blank and flagged after one retry', async () => {
  for (const status of [403, 429]) {
    let calls = 0;
    const result = await run({ sleep: async () => {}, fetchImpl: async () => {
      calls += 1; return response(site, status, 'text/html');
    } });
    assert.equal(calls, 2);
    assert.equal(result.fixture.places[0].logoUrl, '');
    assert.equal(result.fixture.places[0].logoCaptureReason, `page_http_${status}`);
    assert.ok(result.fixture.thingOverrides['place:1'].missingFields.includes('logo'));
  }
});

test('only HTTP 200 image content fills; malformed manifests and failed icons stay audited and blank', async () => {
  for (const [status, type] of [[201, 'image/png'], [204, 'image/png'], [200, 'text/html'], [403, 'image/png'], [429, 'image/png']]) {
    const result = await run({ sleep: async () => {}, fetchImpl: async (url) => url === site
      ? response(site, 200, 'text/html', '<link rel="icon" href="/declared.png"><link rel="manifest" href="/broken.json">')
      : url.endsWith('broken.json') ? response(url, 200, 'application/json', 'invalid json') : response(url, status, type) });
    assert.equal(result.fixture.places[0].logoUrl, '');
    assert.equal(result.fixture.places[0].logoCaptureReason, 'no_icon_answered_with_image');
    assert.equal(result.logoChecks.at(-1).status, status);
    assert.equal(result.logoChecks.at(-1).type, type);
  }
});

test('apple-touch icons with encoded query strings work; declared favicon is allowed', async () => {
  for (const [rel, href, expected] of [['apple-touch-icon', '/apple.png?a=1&amp;b=2', `${site}apple.png?a=1&b=2`],
    ['shortcut icon', '/favicon.ico', `${site}favicon.ico`]]) {
    const result = await run({ fetchImpl: async (url) => url === site
      ? response(site, 200, 'text/html', `<link href="${href}" rel="${rel}">`)
      : (assert.equal(url, expected), response(url, 200, 'image/x-icon')) });
    assert.equal(result.fixture.places[0].logoUrl, expected);
  }
});

test('retry recording replays transient responses and identical audit without network', async () => {
  let calls = 0;
  const recording = recordedFetch({ fetchImpl: async (url, options) => {
    if (url === logo && ++calls === 1) return response(url, 429, 'text/html');
    return http(url, options);
  } });
  const first = await run({ fetchImpl: recording.fetch, sleep: async () => {} });
  const replay = recordedFetch({ records: structuredClone(recording.records), replay: true });
  const second = await run({ fetchImpl: replay.fetch, sleep: async () => {} });
  assert.equal(encode(first), encode(second));
  assert.equal(calls, 2);
});

test('category-scoped rebuild preserves excluded transport rows and their overrides byte for byte', async () => {
  const input = shared(1, [place(1), { ...place(2, 'Flight option', 'Transport'), custom: 'keep' }]);
  input.thingOverrides['place:2'] = { custom: 'keep' };
  const result = await run({ fixture: input, categories: ['restaurant'] });
  assert.deepEqual(result.fixture.places[1], input.places[1]);
  assert.deepEqual(result.fixture.thingOverrides['place:2'], input.thingOverrides['place:2']);
  assert.equal(result.matches.length, 1);
  assert.equal(result.fixture.places[0].logoUrl, logo);
});

const flight = (id, name, extra = {}) => ({ id, name, category_name: 'Flight', website: '', logoUrl: 'https://www.southwest.com/favicon.ico', ...extra });
const airlineSite = (url, accept, html = '<link rel="icon" href="/assets/swa.png">') => url === 'https://www.southwest.com/'
  ? response(url, 200, 'text/html', html)
  : (assert.equal(accept, 'image/*'), response(url, 200, 'image/png'));

test('flight rows take the airline own-site declared icon, replacing a favicon guess on row and override', async () => {
  const input = shared(1, [place(1), flight(2, 'Southwest LAS → LGA')]);
  input.thingOverrides['place:2'] = { logoUrl: 'https://www.southwest.com/favicon.ico', airline: 'Southwest', price: 164 };
  const calls = [];
  const result = await run({ fixture: input, staging: structuredClone(input), fetchImpl: async (url, options) => {
    calls.push(String(url));
    return url === site || url === logo ? http(url, options) : airlineSite(url, options.headers.accept);
  } });
  const expected = { logo: 'https://www.southwest.com/assets/swa.png', source: 'https://www.southwest.com/', verified: true, reason: '' };
  assert.equal(result.fixture.places[1].logoUrl, expected.logo);
  assert.deepEqual(result.fixture.places[1].airlineLogo, expected);
  assert.deepEqual(result.fixture.thingOverrides['place:2'], { airline: 'Southwest', price: 164, logoUrl: expected.logo, logoCaptureReason: '', airlineLogo: expected });
  assert.deepEqual(result.airlineLogos, [{ id: 2, name: 'Southwest LAS → LGA', airline: 'Southwest', ...expected }]);
  assert.ok(!calls.includes('https://www.southwest.com/favicon.ico'));
  assert.deepEqual(result.matches.map((row) => row.id), [1]);
  assert.equal(result.fixture.places[1].websiteCapture, undefined);
});

test('flight blanks carry airline_logo_unverified reasons; unknown carriers and failed sites never keep a guess', async () => {
  for (const [row, fetchImpl, reason] of [
    [flight(2, 'Southwest LAS → LGA'), async () => { throw new Error('offline'); }, 'airline_logo_unverified:page_fetch_failed:offline'],
    [flight(2, 'Southwest LAS → LGA'), async (url, o) => airlineSite(url, o.headers.accept, '<html>no icon</html>'), 'airline_logo_unverified:no_declared_icon'],
    [flight(2, 'Mystery Air JFK → LAS'), async () => assert.fail('unknown carrier fetched'), 'airline_logo_unverified:unknown_airline'],
  ]) {
    const input = shared(1, [row]);
    const result = await run({ fixture: input, staging: structuredClone(input), fetchImpl, sleep: async () => {} });
    assert.equal(result.fixture.places[0].logoUrl, '');
    assert.equal(result.fixture.places[0].logoCaptureReason, reason);
    assert.equal(result.fixture.places[0].airlineLogo.verified, false);
    assert.equal(result.fixture.thingOverrides['place:2'].logoUrl, '');
    assert.equal(result.fixture.thingOverrides['place:2'].logoCaptureReason, reason);
  }
});

test('airline comes from override, title or own-site website; place rows are byte-identical with or without flights', async () => {
  const seen = [];
  const fetchImpl = async (url, options) => { seen.push(String(url)); return url === site || url === logo ? http(url, options) : response(url, 404, 'text/html'); };
  const input = shared(1, [place(1), flight(2, 'Red-eye', { website: 'https://www.jetblue.com/booking/flights?from=LAS' }),
    flight(3, 'American Airlines JFK → LAS'), flight(4, 'Option 4')]);
  input.thingOverrides['place:4'] = { airline: 'Delta' };
  const result = await run({ fixture: input, staging: structuredClone(input), fetchImpl });
  assert.deepEqual(result.airlineLogos.map((row) => [row.airline, row.source, row.reason]), [
    ['https://www.jetblue.com/booking/flights?from=LAS', 'https://www.jetblue.com/', 'airline_logo_unverified:page_http_404'],
    ['American', 'https://www.aa.com/', 'airline_logo_unverified:page_http_404'],
    ['Delta', 'https://www.delta.com/', 'airline_logo_unverified:page_http_404'],
  ]);
  const placeOnly = await run({ fixture: shared(1, [place(1)]), staging: shared(1, [place(1)]), fetchImpl: http });
  assert.equal(encode(result.fixture.places[0]), encode(placeOnly.fixture.places[0]));
  assert.equal(encode(result.fixture.thingOverrides['place:1']), encode(placeOnly.fixture.thingOverrides['place:1']));
  assert.equal(encode(result.audit), encode(placeOnly.audit));
  assert.equal(encode(result.matches), encode(placeOnly.matches));
});

test('category scope without flight leaves flight rows untouched; airline evidence replays offline', async () => {
  const input = shared(1, [place(1), flight(2, 'Southwest LAS → LGA')]);
  input.thingOverrides['place:2'] = { custom: 'keep' };
  const scoped = await run({ fixture: input, staging: structuredClone(input), categories: ['restaurant'] });
  assert.deepEqual(scoped.fixture.places[1], input.places[1]);
  assert.deepEqual(scoped.fixture.thingOverrides['place:2'], input.thingOverrides['place:2']);
  assert.deepEqual(scoped.airlineLogos, []);
  const recording = recordedFetch({ fetchImpl: async (url, options) => url === site || url === logo ? http(url, options) : airlineSite(url, options.headers.accept) });
  const first = await run({ fixture: input, staging: structuredClone(input), fetchImpl: recording.fetch });
  const replay = recordedFetch({ records: structuredClone(recording.records), replay: true, fetchImpl: () => assert.fail('offline replay fetched network') });
  const second = await run({ fixture: input, staging: structuredClone(input), fetchImpl: replay.fetch });
  assert.equal(first.fixture.places[1].logoUrl, 'https://www.southwest.com/assets/swa.png');
  assert.equal(encode(first), encode(second));
});

test('manifest failure does not hide a valid declared HTML icon; banned provider declarations never fetch', async () => {
  const result = await run({ sleep: async () => {}, fetchImpl: async (url) => {
    if (url === site) return response(site, 200, 'text/html', '<link rel="manifest" href="/app.json">'
      + '<link rel="icon" href="https://www.google.com/faviconV2?domain=venue.example">'
      + '<link rel="icon" href="https://vacation-staging.timesyncher.com/logo.png">'
      + '<link rel="apple-touch-icon" href="/declared.png">');
    if (url === `${site}app.json`) return response(url, 403, 'text/html');
    assert.equal(url, logo); return response(url, 200, 'image/png');
  } });
  assert.equal(result.fixture.places[0].logoUrl, logo);
  assert.equal(result.logoChecks.filter((check) => check.kind === 'manifest').length, 2);
});
