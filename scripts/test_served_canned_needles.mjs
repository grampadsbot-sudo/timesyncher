import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, readdirSync, readFileSync } from 'node:fs';
import { readFile as readFileAsync } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadDefaultEulaText } from '../src/onboarding/eula-persistent-core.mjs';
import { renderServedTrekBundle } from '../src/vacation/trek-style2-bundle.mjs';
import { SERVED_QA_NEEDLES } from '../scripts/strip-served-trek-bundle.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));

/** N3 geo / travel-gap / TBD marketing; N4 demo names / price copy; N5 car filter brand. */
const SERVED_CANNED_NEEDLES = [
  ...SERVED_QA_NEEDLES,
  'Si=[[/park central/i',
  'ii=[[/61\\s+w',
  '"TBD"',
  'Craig',
  'TimeSyncher Vacation Setup',
  'telegram_collaborators_single_trip',
];

const HTML_FILES = [
  'index.html',
  'order-test.html',
  'order-success.html',
  'addons-checkout.html',
  'access-checkout.html',
  'owner-media-checkout.html',
  'shared-app.html',
  'vacation-app.html',
];

function scanText(label, text) {
  const hits = [];
  for (const needle of SERVED_CANNED_NEEDLES) {
    if (needle === 'Craig') {
      if (/\bCraig\b/.test(text)) hits.push({ needle, label });
      continue;
    }
    if (text.includes(needle)) hits.push({ needle, label });
  }
  return hits;
}

async function readServedAssets() {
  const targets = [];
  const assetDir = path.join(root, 'public/assets');
  for (const name of readdirSync(assetDir)) {
    if (name.endsWith('.js')) targets.push({ label: `public/assets/${name}`, path: path.join(assetDir, name) });
  }
  for (const name of readdirSync(path.join(root, 'public'))) {
    if (name.endsWith('.js')) targets.push({ label: `public/${name}`, path: path.join(root, 'public', name) });
  }
  for (const file of HTML_FILES) {
    targets.push({ label: file, path: path.join(root, file) });
  }
  return targets;
}

const UPSTREAM_COMMIT = '06e47169699ffdee8accf48e74b0a247a8793ebc^';
const UPSTREAM_PATH = 'public/assets/upstream/index-BKun7ofk.js';
const raw = execFileSync('git', ['show', `${UPSTREAM_COMMIT}:${UPSTREAM_PATH}`], { maxBuffer: 50 * 1024 * 1024 });
const rendered = renderServedTrekBundle(raw.toString('utf8'));
const committed = await readFileAsync(path.join(root, 'public/assets/index-BKun7ofk.js'), 'utf8');
assert.equal(rendered, committed, 'public/assets/index-BKun7ofk.js must match renderServedTrekBundle');

const hits = [];
for (const target of await readServedAssets()) {
  const text = await readFileAsync(target.path, 'utf8');
  for (const hit of scanText(target.label, text)) {
    const line = text.slice(0, text.indexOf(hit.needle)).split('\n').length;
    hits.push({ ...hit, file: target.label, line });
  }
}

assert.equal(hits.length, 0, hits.map((h) => `${h.needle} @ ${h.file}:${h.line}`).join('\n'));

const eulaText = loadDefaultEulaText({ TIMESYNCHER_COLLABORATOR_NAME: 'Collaborator seat' });
assert.doesNotMatch(eulaText, /telegram_collaborators_single_trip/);
assert.doesNotMatch(eulaText, /TimeSyncher Vacation Setup/);

execFileSync('npm', ['run', 'build'], {
  cwd: root,
  env: { ...process.env, VERCEL_GIT_COMMIT_SHA: process.env.VERCEL_GIT_COMMIT_SHA || '0123456789abcdef0123456789abcdef01234567' },
  stdio: 'inherit',
});

const distDir = path.join(root, 'dist');
const distAssets = path.join(distDir, 'assets');
for (const name of readdirSync(distAssets)) {
  if (!name.endsWith('.js') && !name.endsWith('.html')) continue;
  const text = readFileSync(path.join(distAssets, name), 'utf8');
  const distHits = scanText(`dist/assets/${name}`, text);
  assert.equal(distHits.length, 0, distHits.map((h) => `${h.needle} @ dist/assets/${name}`).join('\n'));
}

console.log('served canned needles ban passed');
