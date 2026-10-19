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

test('brand-domain favicon without a declaration or recorded evidence is accepted', async () => {
  const icon = new URL('/favicon.ico', site).href;
  const result = await run({ fetchImpl: async (url, opts) => {
    if (opts.headers.accept === 'text/html') return { ok: true, status: 200, url: site, text: async () => '<html>Venue</html>' };
    assert.equal(url, icon);
    return { ok: true, status: 200, url: icon, headers: new Headers({ 'content-type': 'image/x-icon' }) };
  } });
  assert.equal(result.fixture.places[0].logoUrl, icon);
  assert.equal(result.applied.report[0].outcome, 'filled');
});

test('nonempty existing fixture logos are preserved, not audited as new or fetched', async () => {
  const existing = fixture();existing.places[0].image_url = 'https://existing.example/logo.png';
  const result = await run({ fixture: existing, fetchImpl: () => assert.fail('nonempty logo fetched') });
  assert.equal(result.fixture.places[0].image_url, 'https://existing.example/logo.png');
  assert.equal(result.applied.report[0].outcome, 'skipped_has_logo');
  assert.deepEqual(result.audit, []);
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
