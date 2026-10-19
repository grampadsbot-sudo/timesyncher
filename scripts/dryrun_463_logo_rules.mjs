#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { buildFixture } from './build_shared_fixture_logos.mjs';
import { NYC_DAYBYDAY_SLUG } from './fixtures/nyc-craig-kim-daybyday-trip.mjs';

const text = (value) => String(value ?? '').trim();
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_JOB_DIR = resolve(REPO_ROOT, '../vk-463-prep-20261017-job/job');
const PUBLIC_SHARED_URL = `https://vacation-staging.timesyncher.com/api/shared/${NYC_DAYBYDAY_SLUG}`;
const DEFAULT_AS_OF = '2026-10-17T22:45:00-07:00';

export function currentLogoUrl(shared, place) {
  const override = shared.thingOverrides?.[`place:${place.id}`] || {};
  const source = override.sourceRecord && typeof override.sourceRecord === 'object' ? override.sourceRecord : {};
  return text(place.logoUrl || place.image_url || override.logoUrl || source.logoUrl);
}

function fixtureWithoutLogos(shared) {
  const fixture = structuredClone(shared);
  for (const place of fixture.places || []) {
    place.website = '';
    delete place.logoUrl;
    delete place.image_url;
    delete place.captured_logo_url;
    const key = `place:${place.id}`;
    const override = fixture.thingOverrides?.[key];
    if (!override) continue;
    delete override.logoUrl;
    if (override.sourceRecord && typeof override.sourceRecord === 'object') {
      delete override.sourceRecord.logoUrl;
    }
  }
  return fixture;
}

export async function probeLogoUrl(url, fetchImpl = globalThis.fetch) {
  const href = text(url);
  if (!href) return { url: '', ok: false, status: null, contentType: '', error: 'no_logo', finalUrl: '' };
  try {
    const response = await fetchImpl(href, {
      method: 'GET',
      redirect: 'follow',
      headers: { accept: 'image/*,*/*;q=0.8' },
      signal: AbortSignal.timeout(12_000),
    });
    const contentType = response.headers?.get?.('content-type') || '';
    await response.body?.cancel?.();
    const imageOk = response.ok && /^image\//i.test(contentType);
    return {
      url: href,
      ok: imageOk,
      status: response.status,
      contentType,
      error: imageOk ? '' : (response.ok ? 'non_image' : `http_${response.status}`),
      finalUrl: response.url || href,
    };
  } catch (error) {
    return {
      url: href,
      ok: false,
      status: null,
      contentType: '',
      error: text(error?.cause?.code || error?.code || error?.message || 'network_error'),
      finalUrl: '',
    };
  }
}

export function classifyDryRunRow({ currentLogoUrl: current, newLogoUrl: next, probe }) {
  const cur = text(current);
  const neu = text(next);
  if (cur === neu) return 'unchanged';
  if (cur && !neu) return 'would-blank';
  if (neu && (!cur || !probe?.ok || cur !== neu)) return 'would-fix';
  return 'unchanged';
}

export function summarizeDryRunRows(rows) {
  const summary = { total: rows.length, wouldFix: 0, wouldBlank: 0, unchanged: 0 };
  for (const row of rows) {
    if (row.change === 'would-fix') summary.wouldFix += 1;
    else if (row.change === 'would-blank') summary.wouldBlank += 1;
    else summary.unchanged += 1;
  }
  return summary;
}

function newRulesReason(place, match, builtPlace) {
  if (text(match?.reason)) return match.reason;
  return text(builtPlace?.logoCaptureReason || builtPlace?.logoProvenance?.reason || '');
}

export async function dryRun463LogoRules(shared, {
  sourceUrl = PUBLIC_SHARED_URL,
  asOf = DEFAULT_AS_OF,
  fetchImpl = globalThis.fetch,
  probeFetchImpl = fetchImpl,
} = {}) {
  if (!shared?.trip?.id || !Array.isArray(shared.places)) {
    throw new Error('shared trip payload requires trip.id and places[]');
  }
  const staging = structuredClone(shared);
  const fixture = fixtureWithoutLogos(shared);
  fixture.trip = { ...fixture.trip, id: `dryrun-fixture-${text(staging.trip.id)}` };
  const built = await buildFixture({
    fixture,
    staging,
    sourceUrl,
    asOf,
    fetchImpl,
  });
  const builtById = new Map(built.fixture.places.map((place) => [String(place.id), place]));
  const matchById = new Map(built.matches.map((row) => [String(row.id), row]));
  const rows = [];
  for (const place of shared.places) {
    const id = String(place.id);
    const current = currentLogoUrl(shared, place);
    const probe = await probeLogoUrl(current, probeFetchImpl);
    const builtPlace = builtById.get(id) || place;
    const match = matchById.get(id) || {};
    const newLogo = text(builtPlace.logoUrl);
    const flagReason = newLogo ? '' : newRulesReason(place, match, builtPlace);
    const change = classifyDryRunRow({ currentLogoUrl: current, newLogoUrl: newLogo, probe });
    rows.push({
      id: place.id,
      name: place.name,
      category: builtPlace.category || place.category_name || place.category?.name || '',
      website: text(place.website || shared.thingOverrides?.[`place:${place.id}`]?.website || match.website),
      currentLogoUrl: current,
      currentLogoProbe: probe,
      newLogoUrl: newLogo,
      newRulesFlagReason: flagReason,
      matchReason: text(match.reason),
      logoCaptureReason: text(builtPlace.logoCaptureReason),
      change,
    });
  }
  return { rows, summary: summarizeDryRunRows(rows), builder: built };
}

async function loadNyc463SharedTrip(fetchImpl = globalThis.fetch) {
  const response = await fetchImpl(PUBLIC_SHARED_URL, { headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(`NYC fixture shared GET failed HTTP ${response.status}`);
  const shared = await response.json();
  if (!Array.isArray(shared.places) || shared.places.length !== 70) {
    throw new Error(`expected 70 NYC mirror places, got ${shared.places?.length ?? 0}`);
  }
  return shared;
}

function mdEscape(value) {
  return String(value ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

function renderMarkdown({ generatedAt, sourceUrl, summary, rows }) {
  const lines = [
    '# VK #463 logo rules dry-run',
    '',
    `Generated: ${generatedAt}`,
    `Source: ${sourceUrl}`,
    '',
    '## Summary',
    '',
    `- Total places: ${summary.total}`,
    `- Would fix: ${summary.wouldFix}`,
    `- Would blank: ${summary.wouldBlank}`,
    `- Unchanged: ${summary.unchanged}`,
    '',
    '## Per place',
    '',
    '| Name | Current logo | Probe | New logo | Flag / reason | Change |',
    '| --- | --- | --- | --- | --- | --- |',
  ];
  for (const row of rows) {
    const probe = row.currentLogoProbe;
    const probeLabel = probe.status == null
      ? `err ${probe.error}`
      : `${probe.status}${probe.contentType ? ` ${probe.contentType}` : ''}${probe.error ? ` (${probe.error})` : ''}`;
    const reason = row.newLogoUrl ? '—' : (row.newRulesFlagReason || row.logoCaptureReason || row.matchReason || '—');
    lines.push(`| ${mdEscape(row.name)} | ${mdEscape(row.currentLogoUrl || '—')} | ${mdEscape(probeLabel)} | ${mdEscape(row.newLogoUrl || '—')} | ${mdEscape(reason)} | ${row.change} |`);
  }
  lines.push('');
  return `${lines.join('\n')}\n`;
}

async function writeDryRunArtifacts(payload, jobDir = DEFAULT_JOB_DIR) {
  await mkdir(jobDir, { recursive: true });
  const jsonPath = resolve(jobDir, '463-dryrun.json');
  const mdPath = resolve(jobDir, '463-dryrun.md');
  await writeFile(jsonPath, `${JSON.stringify(payload, null, 2)}\n`);
  await writeFile(mdPath, renderMarkdown(payload));
  return { jsonPath, mdPath };
}

async function main() {
  const args = Object.fromEntries(process.argv.slice(2).reduce((list, value, index, all) => {
    if (value.startsWith('--')) list.push([value.slice(2), all[index + 1]]);
    return list;
  }, []));
  const jobDir = resolve(args['job-dir'] || DEFAULT_JOB_DIR);
  const shared = args.input
    ? JSON.parse(await (await import('node:fs/promises')).readFile(resolve(args.input), 'utf8'))
    : await loadNyc463SharedTrip();
  const result = await dryRun463LogoRules(shared, {
    sourceUrl: args.source || PUBLIC_SHARED_URL,
    asOf: args['as-of'] || DEFAULT_AS_OF,
  });
  const payload = {
    generatedAt: new Date().toISOString(),
    sourceUrl: args.source || PUBLIC_SHARED_URL,
    asOf: args['as-of'] || DEFAULT_AS_OF,
    placeCount: shared.places.length,
    summary: result.summary,
    rows: result.rows,
  };
  const paths = await writeDryRunArtifacts(payload, jobDir);
  console.log(JSON.stringify({ ...result.summary, ...paths }, null, 2));
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
