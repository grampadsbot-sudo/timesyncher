import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { buildFixture } from './build_shared_fixture_logos.mjs';

const snapshot = JSON.parse(await readFile(new URL('./fixtures/pr336-vk-search-places.snapshot.json', import.meta.url), 'utf8'));
const pending = { todo: 'waits on #470 builder integration' };
const text = (value) => String(value ?? '').trim();
const pathname = (value) => { try { return decodeURIComponent(url(value)?.pathname || ''); } catch { return ''; } };
const url = (value) => { try { const u = new URL(value); return /^https?:$/.test(u.protocol) && !u.username && !u.password ? u : null; } catch { return null; } };
const airlineHosts = { southwest: 'southwest.com', jetblue: 'jetblue.com', delta: 'delta.com', american: 'aa.com' };
const onHost = (host, root) => host === root || host.endsWith(`.${root}`);

const suffixes = ['com', 'org', 'net', 'edu', 'gov', 'test', 'example', 'co.uk', 'org.uk', 'com.au', 'github.io'];
function registrable(value) {
  const host = url(value)?.hostname.toLowerCase().replace(/\.$/, '');
  if (!host) return '';
  const suffix = suffixes.filter((s) => host.endsWith(`.${s}`)).sort((a, b) => b.length - a.length)[0];
  if (!suffix) return '';
  return host.split('.').slice(-(suffix.split('.').length + 1)).join('.');
}
function guesser(value) {
  const u = url(value);
  if (!u) return false;
  return (onHost(u.hostname, 'google.com') && /^\/s2\/favicons(?:\/|$)/i.test(u.pathname))
    || (onHost(u.hostname, 'gstatic.com') && (/^\/faviconV2(?:\/|$)/i.test(u.pathname) || /^t[^.]*\.gstatic\.com$/i.test(u.hostname)))
    || ['duckduckgo.com', 'clearbit.com', 'icon.horse', 'faviconkit.com', 'favicongrabber.com', 'favicon.io'].some((h) => onHost(u.hostname, h));
}
function contexts(row) {
  return [row, row.metadata, row.sourceRecord, row.metadata?.sourceRecord].filter(Boolean);
}
function declaration(row, logo, website) {
  for (const context of contexts(row)) {
    for (const p of [context.logoProvenance, context.airlineLogo, context]) {
      if (!p || text(p.iconUrl ?? p.logo) !== logo) continue;
      const source = url(p.pageUrl ?? p.source);
      if (!source || source.href === url(logo)?.href || /\.(?:ico|png|jpe?g|gif|svg|webp)$/i.test(source.pathname) || guesser(source.href) || !registrable(website) || registrable(source.href) !== registrable(website)) continue;
      if (p.verified === false) continue;
      return p;
    }
  }
  return null;
}
function logoFields(row, path = '') {
  const found = [];
  if (!row || typeof row !== 'object') return found;
  for (const [key, value] of Object.entries(row)) {
    const field = path ? `${path}.${key}` : key;
    if (/^(?:logo|logoUrl|logo_url|airlineLogoUrl|airline_logo_url)$/i.test(key) && typeof value === 'string') found.push([field, text(value)]);
    else if (value && typeof value === 'object') found.push(...logoFields(value, field));
  }
  return found;
}
function logoViolations(row, website) {
  const failures = [];
  for (const [field, logo] of logoFields(row)) {
    if (!logo) continue;
    const label = `${field} ${logo}`;
    if (!url(logo)) failures.push(`${label}: invalid/glyph URL`);
    else if (guesser(logo)) failures.push(`${label}: favicon guesser`);
    else if (!declaration(row, logo, website)) {
      if (/\/favicon\.ico$/i.test(pathname(logo))) failures.push(`${label}: no declared-icon source`);
      else if (!registrable(website) || registrable(logo) !== registrable(website)) failures.push(`${label}: different/unknown registrable domain without declaration`);
    }
  }
  return failures;
}
function flightViolations(row, website) {
  const failures = logoViolations(row, website);
  const carrier = Object.keys(airlineHosts).find((name) => new RegExp(`\\b${name}\\b`, 'i').test(`${row.name || row.title} ${row.sourceRecord?.description || ''}`));
  const logos = logoFields(row).filter(([, value]) => value);
  if (!logos.length) {
    const reason = contexts(row).map((c) => c.logoCaptureReason || c.airlineLogo?.reason || c.reason).find((r) => /^airline_logo_unverified:.+/.test(text(r)));
    if (!reason) failures.push('blank logo without airline_logo_unverified:* reason');
    if (contexts(row).some((c) => c.verified === true || c.airlineLogo?.verified === true)) failures.push('blank logo marked verified');
  }
  for (const [field, logo] of logos) {
    const p = declaration(row, logo, website);
    const source = url(p?.source ?? p?.pageUrl);
    if (!carrier || !source || !onHost(source.hostname, airlineHosts[carrier]) || p.verified !== true) failures.push(`${field} ${logo}: missing verified declaration from row airline`);
    if (/(?:glyph|generic|placeholder|emoji|twemoji|material-icons)/i.test(logo)) failures.push(`${field} ${logo}: generic glyph`);
  }
  return failures;
}
function rows(shared) {
  const output = [];
  for (const place of shared.places || []) {
    const override = shared.thingOverrides?.[`place:${place.id}`] || {};
    const website = place.website || override.website || override.sourceRecord?.website;
    for (const [layer, row] of [['place', place], ['override', override]]) output.push({ id: place.id, layer, row, website, flight: /flight/i.test(place.category_name || place.category?.name || place.category || '') });
  }
  for (const thing of shared.things || []) output.push({ id: thing.id, layer: 'thing', row: thing, website: thing.website || thing.metadata?.sourceRecord?.website, flight: /flight/i.test(thing.category || thing.metadata?.categoryName || '') });
  return output;
}
const snapshotRows = Object.entries(snapshot).map(([id, row]) => ({ ...row, id, website: row.sourceRecord?.website || row.url }));
const asShared = () => ({ trip: { id: '470-snapshot-contract' }, places: snapshotRows.map((row) => ({ ...structuredClone(row), name: row.title, category_name: row.category })), thingOverrides: {} });
const offline = async () => { throw new Error('offline contract: network forbidden'); };
async function rebuild(fixture) {
  return (await buildFixture({ fixture, staging: structuredClone(fixture), sourceUrl: 'https://vacation-staging.timesyncher.com/api/shared/offline-470', asOf: '2026-10-18T03:32:48Z', fetchImpl: offline })).fixture;
}
async function nycFixture() {
  const { buildNycCraigKimDaybydayTrip } = await import('./fixtures/nyc-craig-kim-daybyday-trip.mjs');
  return buildNycCraigKimDaybydayTrip();
}
function assertRows(shared, flightsOnly = false) {
  const entries = rows(shared).filter((entry) => !flightsOnly || entry.flight);
  assert.ok(entries.length, 'must inspect actual fixture rows');
  const failures = entries.flatMap(({ id, layer, row, website }) => (flightsOnly ? flightViolations(row, website) : logoViolations(row, website)).map((reason) => `${id} ${layer}: ${reason}`));
  assert.equal(failures.length, 0, failures.join('\n'));
}

test('checked-in NYC snapshot inventory is nonempty and includes flight 601', () => {
  assert.equal(snapshotRows.length, 11);
  assert.equal(snapshot['601'].category, 'flight');
  assert.ok(snapshotRows.every((row) => row.id && row.title));
});
test('all favicon guesser families are rejected even with claimed provenance', () => {
  for (const logo of ['https://www.google.com/s2/favicons?domain=venue.example', 'https://www.gstatic.com/faviconV2?url=venue.example', 'https://t0.gstatic.com/anything', 'https://icons.duckduckgo.com/ip3/venue.example.ico', 'https://logo.clearbit.com/venue.example', 'https://icon.horse/icon/venue.example']) {
    assert.ok(logoViolations({ logoUrl: logo, logoProvenance: { pageUrl: 'https://venue.example', iconUrl: logo } }, 'https://venue.example').some((v) => v.includes('guesser')), logo);
  }
});
test('favicon paths require a matching declaring document; plain search evidence is insufficient', () => {
  const logoUrl = 'https://venue.example/favicon.ico';
  assert.ok(logoViolations({ logoUrl: 'https://venue.example/%66avicon.ico' }, 'https://venue.example').length);
  assert.ok(logoViolations({ logoUrl, logoProvenance: { pageUrl: logoUrl, iconUrl: logoUrl } }, 'https://venue.example').length);
  assert.ok(logoViolations({ logoUrl, logoSearchEvidence: { website: 'https://venue.example', logoUrl } }, 'https://venue.example').length);
  assert.deepEqual(logoViolations({ logoUrl, logoProvenance: { pageUrl: 'https://venue.example', iconUrl: logoUrl } }, 'https://venue.example'), []);
});
test('cross-domain CDN logos need matching provenance; sibling domains use registrable identity', () => {
  assert.deepEqual(logoViolations({ logoUrl: 'https://assets.venue.co.uk/logo.png' }, 'https://www.venue.co.uk'), []);
  assert.ok(logoViolations({ logoUrl: 'https://other.co.uk/logo.png' }, 'https://venue.co.uk').length);
  assert.ok(logoViolations({ logoUrl: 'https://other.github.io/logo.png' }, 'https://venue.github.io').length);
  const logoUrl = 'https://cdn.example/icon.png';
  assert.ok(logoViolations({ logoUrl }, 'https://venue.example').length);
  assert.deepEqual(logoViolations({ logoUrl, logoProvenance: { pageUrl: 'https://venue.example', iconUrl: logoUrl } }, 'https://venue.example'), []);
  assert.ok(logoViolations({ logoUrl, logoProvenance: { pageUrl: 'https://other.example', iconUrl: logoUrl } }, 'https://venue.example').length);
});
test('nested source logo fields cannot hide behind a blank presentation logo', () => {
  assert.ok(logoViolations({ logoUrl: '', metadata: { sourceRecord: { logoUrl: 'https://venue.example/favicon.ico' } } }, 'https://venue.example').length);
  assert.deepEqual(logoViolations({ logoUrl: '', logoCaptureReason: 'no_declared_icon' }, ''), []);
});
test('flight row result requires its own airline declaration or an explicitly unverified blank', () => {
  const base = { name: 'Delta JFK → LAS' };
  assert.deepEqual(flightViolations({ ...base, logoUrl: '', logoCaptureReason: 'airline_logo_unverified:page_http_403' }, 'https://www.delta.com/'), []);
  assert.ok(flightViolations({ ...base, logoUrl: '' }, 'https://www.delta.com/').length);
  const result = { logo: 'https://cdn.example/delta.png', source: 'https://www.delta.com/manifest.json', verified: true, reason: '' };
  assert.deepEqual(flightViolations({ ...base, airlineLogo: result }, 'https://www.delta.com/'), []);
  for (const changed of [{ source: 'https://www.jetblue.com/' }, { source: 'https://hotel.example/' }, { verified: false }, { logo: 'https://cdn.example/generic-glyph.svg' }]) assert.ok(flightViolations({ ...base, airlineLogo: { ...result, ...changed } }, 'https://www.delta.com/').length);
});
test('snapshot builder replay stays offline and keeps all row identities', async () => {
  const fixture = asShared();
  const output = await rebuild(fixture);
  assert.deepEqual(output.places.map((p) => p.id), fixture.places.map((p) => p.id));
});

test('checked-in NYC snapshot has no guessed logos in any row/source field', pending, () => {
  assertRows(asShared());
});
test('NYC full fixture has no guessed logos in places and Thing overrides', pending, async () => {
  assertRows(await nycFixture());
});
test('#468 builder output has no guessed logos in any row/Thing field', pending, async () => {
  assertRows(await rebuild(await nycFixture()));
});
test('#468 builder output gives every flight its verified airline logo or flagged blank', pending, async () => {
  const output = await rebuild(await nycFixture());
  assert.equal(output.places.filter((p) => /flight/i.test(p.category_name)).length, 7, 'include selected and list-only flights');
  assertRows(output, true);
});
