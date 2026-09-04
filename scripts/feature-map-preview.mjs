#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import {
  DEFAULT_PREVIEW_ORIGIN,
  EXPECTED_DEPLOYMENT_ID,
  EXPECTED_HEAD,
  PREVIEW_MAP_REL,
  PREVIEW_SCENARIOS,
  assertNoSecret,
  bypassSecretPresent,
  compactPreviewReceipt,
  evaluatePreviewMap,
  extractFeatureMap,
  keepFeatureMapEntries,
  observationsToHar,
  previewMapStable,
  probePreview,
  sanitizeHar,
  writePreviewMap,
} from '../src/vacation/feature-map-preview.mjs';

const cwd = process.cwd();

function usage() {
  return [
    'feature-map-preview — hosted PR-preview probe + HAR extract',
    '',
    'Commands:',
    '  presence                     Check VERCEL_PROTECTION_BYPASS without printing it',
    '  probe --origin <url>         Fetch feature-map routes with the bypass header',
    '  extract --har <path>         Deterministic HAR → features/preview-map.json',
    '  run --origin <url>           Probe, extract, write preview-map + receipt',
    '  playwright --origin <url>    Optional Chromium HAR capture, then extract',
    '',
    'Never prints VERCEL_PROTECTION_BYPASS. Stop on SSO/auth failure.',
    'Not a doctor/CI target. Not a certify/merge lever.',
  ].join('\n');
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const args = { command, json: false, origin: DEFAULT_PREVIEW_ORIGIN, har: '', persist: true };
  for (let i = 0; i < rest.length; i += 1) {
    const token = rest[i];
    if (token === '--json') args.json = true;
    else if (token === '--no-persist') args.persist = false;
    else if (token === '--origin') args.origin = rest[++i];
    else if (token === '--har') args.har = rest[++i];
  }
  return args;
}

function nowStamp() {
  return new Date().toISOString().replace(/[:.]/g, '').replace('T', 't').replace('Z', 'z');
}

function jobId() {
  return `vac-verify-preview-integrated-${nowStamp()}`;
}

function writeEvents(dir, events) {
  const file = path.join(dir, 'events.jsonl');
  fs.writeFileSync(file, events.map((event) => JSON.stringify(event)).join('\n') + '\n');
  return file;
}

function appendEvent(events, step, detail) {
  events.push({ ts: new Date().toISOString(), step, ...detail });
}

function printPresence(json) {
  const present = bypassSecretPresent();
  const payload = {
    VERCEL_PROTECTION_BYPASS: present ? 'PRESENT_NON_EMPTY' : 'MISSING',
    length: present ? String(process.env.VERCEL_PROTECTION_BYPASS).length : 0,
  };
  if (json) process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  else console.log(`VERCEL_PROTECTION_BYPASS ${payload.VERCEL_PROTECTION_BYPASS}`);
  return present;
}

function readHar(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

async function runPlaywright(origin) {
  const outDir = path.join(cwd, 'artifacts', 'vacation-verify', 'preview-playwright');
  fs.mkdirSync(outDir, { recursive: true });
  const harPath = path.join(outDir, 'preview.har');
  const scriptPath = path.join(outDir, 'playwright-capture.mjs');
  const pages = PREVIEW_SCENARIOS
    .filter((row) => row.kind === 'document' && row.method === 'GET')
    .map((row) => row.path);
  const script = `
import { chromium } from 'playwright';
const origin = process.env.PREVIEW_ORIGIN;
const harPath = process.env.PREVIEW_HAR;
const pages = ${JSON.stringify(pages)};
if (!process.env.VERCEL_PROTECTION_BYPASS) {
  console.error('bypass missing');
  process.exit(2);
}
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  extraHTTPHeaders: {
    'x-vercel-protection-bypass': process.env.VERCEL_PROTECTION_BYPASS,
    'x-vercel-set-bypass-cookie': 'true',
  },
  recordHar: { path: harPath, mode: 'full', content: 'embed' },
});
const page = await context.newPage();
const visits = [];
for (const rel of pages) {
  const url = new URL(rel, origin).toString();
  const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  const title = await page.title();
  const body = await page.locator('body').innerText().catch(() => '');
  visits.push({
    path: rel,
    status: response ? response.status() : 0,
    final_url_host: new URL(page.url()).host,
    title,
    sso: /vercel\\.com\\/(sso|login)/i.test(page.url()) || /Authentication Required|Vercel SSO/i.test(body.slice(0, 400)),
  });
  if (visits.at(-1).sso) break;
}
await context.close();
await browser.close();
process.stdout.write(JSON.stringify({ visits }, null, 2) + '\\n');
`;
  fs.writeFileSync(scriptPath, script);
  const installPkg = spawnSync('npm', ['install', '--no-save', '--no-audit', '--no-fund', 'playwright'], {
    cwd,
    encoding: 'utf8',
    env: process.env,
  });
  if (installPkg.status !== 0) {
    return { ran: false, reason: 'playwright_pkg_failed', detail: (installPkg.stderr || installPkg.stdout || '').slice(0, 400) };
  }
  const install = spawnSync('npx', ['--yes', 'playwright', 'install', 'chromium'], {
    cwd,
    encoding: 'utf8',
    env: process.env,
  });
  if (install.status !== 0) {
    return { ran: false, reason: 'playwright_install_failed', detail: (install.stderr || install.stdout || '').slice(0, 400) };
  }
  const nodeRun = spawnSync(process.execPath, [scriptPath], {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      PREVIEW_ORIGIN: origin,
      PREVIEW_HAR: harPath,
    },
  });
  if (nodeRun.status !== 0) {
    return {
      ran: false,
      reason: 'playwright_run_failed',
      detail: (nodeRun.stderr || nodeRun.stdout || '').slice(0, 600),
      har: fs.existsSync(harPath) ? path.relative(cwd, harPath) : null,
    };
  }
  let visits = [];
  try {
    visits = JSON.parse(nodeRun.stdout).visits || [];
  } catch {
    visits = [];
  }
  return {
    ran: true,
    har: path.relative(cwd, harPath),
    visits,
    sso: visits.some((row) => row.sso),
  };
}

async function captureAndExtract(args, { playwright = false } = {}) {
  const events = [];
  const job = jobId();
  const artifactDir = path.join(cwd, 'features', 'proof', 'vac-verify-preview-integrated');
  fs.mkdirSync(artifactDir, { recursive: true });
  appendEvent(events, 'initialize', { job_id: job, origin: args.origin });
  if (!bypassSecretPresent()) {
    appendEvent(events, 'presence', { status: 'missing' });
    writeEvents(artifactDir, events);
    return { ok: false, reason: 'bypass_missing', job_id: job };
  }
  appendEvent(events, 'presence', { status: 'present_non_empty' });

  let playwrightResult = { ran: false };
  if (playwright) {
    appendEvent(events, 'playwright_start', { origin: args.origin });
    playwrightResult = await runPlaywright(args.origin);
    appendEvent(events, 'playwright_complete', {
      ran: playwrightResult.ran,
      reason: playwrightResult.reason || null,
      sso: playwrightResult.sso || false,
    });
    if (playwrightResult.sso) {
      writeEvents(artifactDir, events);
      return { ok: false, reason: 'auth_failure', playwright: playwrightResult, job_id: job };
    }
  }

  const probe = await probePreview({ origin: args.origin });
  appendEvent(events, 'probe', {
    ok: probe.ok,
    reason: probe.reason || null,
    count: (probe.observations || []).length,
  });
  if (probe.reason === 'auth_failure') {
    writeEvents(artifactDir, events);
    return { ok: false, reason: 'auth_failure', probe, job_id: job };
  }

  const harFromProbe = observationsToHar(probe.observations || [], { origin: args.origin });
  let har = harFromProbe;
  if (args.har && fs.existsSync(args.har)) {
    har = readHar(args.har);
  } else if (playwrightResult.har && fs.existsSync(path.join(cwd, playwrightResult.har))) {
    const browserHar = readHar(path.join(cwd, playwrightResult.har));
    har = {
      log: {
        version: '1.2',
        creator: { name: 'timesyncher-feature-map-preview-merged', version: '1' },
        entries: [...(sanitizeHar(browserHar).log.entries || []), ...(harFromProbe.log.entries || [])],
      },
    };
  }
  const sanitizedPath = path.join(artifactDir, 'network.sanitized.har.json');
  const sanitized = keepFeatureMapEntries(har, { origin: args.origin });
  const sanitizedText = `${JSON.stringify(sanitized, null, 2)}\n`;
  assertNoSecret(sanitizedText);
  fs.writeFileSync(sanitizedPath, sanitizedText);
  appendEvent(events, 'har_sanitized', { path: path.relative(cwd, sanitizedPath) });

  const map = extractFeatureMap(har, { origin: args.origin });
  if (args.persist) writePreviewMap(map, cwd);
  const evaluation = evaluatePreviewMap(map);
  appendEvent(events, 'extract', { digest: map.extract_digest, ok: evaluation.ok });
  appendEvent(events, 'complete', { ok: evaluation.ok, certified: false });
  const eventsRel = path.relative(cwd, writeEvents(artifactDir, events));
  const receipt = compactPreviewReceipt({
    jobId: job,
    map,
    evaluation,
    eventsRel,
    artifactDir: path.relative(cwd, artifactDir),
    playwright: {
      ran: Boolean(playwrightResult.ran),
      visits: playwrightResult.visits || [],
      sso: Boolean(playwrightResult.sso),
      reason: playwrightResult.reason || null,
    },
    head: EXPECTED_HEAD,
    notes: [
      `Deploy target remains ${args.origin} / ${EXPECTED_DEPLOYMENT_ID}.`,
      'Not certified. No merge. No customer tests.',
    ],
  });
  const receiptText = `${JSON.stringify(receipt, null, 2)}\n`;
  assertNoSecret(receiptText);
  fs.writeFileSync(path.join(artifactDir, 'receipt.json'), receiptText);
  fs.writeFileSync(path.join(artifactDir, 'dry-run.json'), `${JSON.stringify(previewMapStable(map), null, 2)}\n`);
  return { ok: evaluation.ok && probe.ok, receipt, map, evaluation, probe, playwright: playwrightResult };
}

const args = parseArgs(process.argv.slice(2));
if (!args.command || args.command === 'help' || args.command === '--help') {
  console.log(usage());
  process.exit(args.command ? 0 : 2);
}

try {
  if (args.command === 'presence') {
    const present = printPresence(args.json);
    process.exit(present ? 0 : 1);
  }

  if (args.command === 'extract') {
    if (!args.har) throw new Error('extract requires --har <path>');
    const map = extractFeatureMap(readHar(args.har), { origin: args.origin });
    if (args.persist) writePreviewMap(map, cwd);
    const evaluation = evaluatePreviewMap(map);
    const payload = { map: previewMapStable(map), evaluation };
    if (args.json) process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    else console.log(`${evaluation.ok ? 'PASS' : 'FAIL'} extract ${PREVIEW_MAP_REL} digest ${map.extract_digest}`);
    process.exit(evaluation.ok ? 0 : 1);
  }

  if (args.command === 'probe' || args.command === 'run' || args.command === 'playwright') {
    const result = await captureAndExtract(args, { playwright: args.command === 'playwright' });
    if (args.json) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    else {
      console.log(`${result.ok ? 'PASS' : 'FAIL'} feature-map-preview ${result.reason || result.receipt?.job_id || ''}`);
      if (result.evaluation) {
        console.log(`  env_gaps: ${result.evaluation.env_gaps.join(', ') || 'none'}`);
        console.log(`  fail_closed: ${result.evaluation.fail_closed.join(', ') || 'none'}`);
        console.log(`  unexpected: ${result.evaluation.unexpected.join(', ') || 'none'}`);
      }
      if (result.playwright?.ran) console.log(`  playwright: ${result.playwright.visits?.length || 0} visits`);
    }
    process.exit(result.ok ? 0 : 1);
  }

  console.error(usage());
  process.exit(2);
} catch (error) {
  console.error(error.message || error);
  process.exit(1);
}
