#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderServedTrekBundle } from '../src/vacation/trek-style2-bundle.mjs';
import {
  patchVk1080VacationCopy,
  VACATION_COPY_REPLACEMENTS,
} from '../src/vacation/trek-vk-1080-vacation-copy-patch.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const UPSTREAM_COMMIT = '06e47169699ffdee8accf48e74b0a247a8793ebc^';
const UPSTREAM_PATH = 'public/assets/upstream/index-BKun7ofk.js';
const TRIP_WORD_RE = /\btrips?\b/i;
const SI_WORD_RE = /\bSI\b/;

function walkFiles(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(full, out);
    else if (/\.(tsx|ts|mjs|js)$/.test(entry.name)) out.push(full);
  }
  return out;
}

function stripAllowlistedTripCopy(text) {
  return String(text || '').replace(/\bround trip\b/gi, '');
}

function collectVacationClientUiStrings(filePath, source) {
  const hits = [];
  const jsxRe = />([^<>{}]+)</g;
  let match = jsxRe.exec(source);
  while (match) {
    const raw = match[1].replace(/\s+/g, ' ').trim();
    if (raw && !/^[\s.,:;!?·•/()[\]{}|&+=-]+$/.test(raw) && !/[;{}]|\b(?:const|let|return|useState|useMemo)\b/.test(raw)) {
      hits.push({ kind: 'jsx', text: raw });
    }
    match = jsxRe.exec(source);
  }
  const attrRe = /\b(?:aria-label|ariaLabel|title|placeholder|alt|message)\s*=\s*(?:"([^"]*)"|'([^']*)'|\{\s*(?:"([^"]*)"|'([^']*)'|`([^`]*)`)\s*\})/g;
  match = attrRe.exec(source);
  while (match) {
    const value = match[1] ?? match[2] ?? match[3] ?? match[4] ?? match[5] ?? '';
    if (value) hits.push({ kind: 'attr', text: value });
    match = attrRe.exec(source);
  }
  const errRe = /(?:throw new Error|message\s*:|let message\s*=)\s*\(?\s*(?:"([^"]*)"|'([^']*)'|`([^`]*)`)/g;
  match = errRe.exec(source);
  while (match) {
    const value = match[1] ?? match[2] ?? match[3] ?? '';
    if (value) hits.push({ kind: 'message', text: value });
    match = errRe.exec(source);
  }
  return hits.map((item) => ({ file: filePath, ...item }));
}

const clientDir = join(ROOT, 'apps/vacation-client/src');
const clientFiles = walkFiles(clientDir);
assert.ok(clientFiles.length >= 20, 'expected vacation-client source files');

const clientViolations = [];
const clientSiViolations = [];
for (const absPath of clientFiles) {
  const rel = absPath.slice(ROOT.length + 1);
  const source = readFileSync(absPath, 'utf8');
  for (const item of collectVacationClientUiStrings(rel, source)) {
    const cleaned = stripAllowlistedTripCopy(item.text);
    if (TRIP_WORD_RE.test(cleaned)) clientViolations.push(item);
    if (SI_WORD_RE.test(item.text)) clientSiViolations.push(item);
  }
}
assert.deepEqual(clientViolations, [], `vacation-client UI still mentions trip: ${JSON.stringify(clientViolations)}`);
assert.deepEqual(clientSiViolations, [], `vacation-client UI contains standalone SI: ${JSON.stringify(clientSiViolations)}`);

const requiredClientSnippets = [
  ['apps/vacation-client/src/App.tsx', 'Could not load this vacation'],
  ['apps/vacation-client/src/App.tsx', 'Loading vacation…'],
  ['apps/vacation-client/src/App.tsx', 'when the vacation owner enables packing'],
  ['apps/vacation-client/src/App.tsx', 'when the vacation owner enables collaboration'],
  ['apps/vacation-client/src/components/AppErrorBoundary.tsx', 'We could not show this vacation.'],
  ['apps/vacation-client/src/api/loadSharedTrip.ts', 'This share link is missing a vacation token.'],
  ['apps/vacation-client/src/api/loadSharedTrip.ts', 'Vacation load timed out.'],
  ['apps/vacation-client/src/api/loadSharedTrip.ts', 'Vacation load failed ('],
  ['apps/vacation-client/src/api/loadSharedTrip.ts', 'Vacation data could not be read.'],
  ['apps/vacation-client/src/api/loadSharedTrip.ts', 'Invalid vacation payload from API'],
  ['apps/vacation-client/src/hooks/useSharedTrip.ts', 'This link is missing vacation information. Open the share link you received from your vacation owner.'],
  ['apps/vacation-client/src/screens/BudgetScreen.tsx', 'Overall vacation budget'],
  ['apps/vacation-client/src/screens/BudgetScreen.tsx', 'Vacation total'],
  ['apps/vacation-client/src/screens/BudgetScreen.tsx', 'ariaLabel="Vacation total target"'],
  ['apps/vacation-client/src/screens/BudgetScreen.tsx', 'Prices from your vacation list will appear here'],
  ['apps/vacation-client/src/screens/DayByDayScreen.tsx', 'No days on this vacation yet.'],
  ['apps/vacation-client/src/screens/DayByDayScreen.tsx', 'aria-label="Vacation days"'],
  ['apps/vacation-client/src/screens/KeepsakeJourneyScreen.tsx', 'Vacation summary'],
  ['apps/vacation-client/src/lib/listTabModel.mjs', "'round trip'"],
];
for (const [rel, snippet] of requiredClientSnippets) {
  const source = readFileSync(join(ROOT, rel), 'utf8');
  assert.ok(source.includes(snippet), `${rel} missing expected copy: ${snippet}`);
}

function extractEnglishLocaleObject(bundleJs) {
  const start = bundleJs.indexOf('const LX={');
  assert.ok(start >= 0, 'English locale object LX missing from bundle');
  const open = bundleJs.indexOf('{', start);
  let depth = 0;
  let inStr = false;
  let quote = '';
  let end = -1;
  for (let i = open; i < bundleJs.length; i += 1) {
    const ch = bundleJs[i];
    if (inStr) {
      if (ch === '\\') {
        i += 1;
        continue;
      }
      if (ch === quote) inStr = false;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      inStr = true;
      quote = ch;
      continue;
    }
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }
  assert.ok(end > open, 'could not find end of English locale object LX');
  return new Function(`return (${bundleJs.slice(open, end)})`)();
}

const upstreamRaw = execFileSync('git', ['show', `${UPSTREAM_COMMIT}:${UPSTREAM_PATH}`], {
  cwd: ROOT,
  maxBuffer: 25 * 1024 * 1024,
}).toString('utf8');
const renderedBundle = renderServedTrekBundle(upstreamRaw);
const committedBundle = readFileSync(join(ROOT, 'public/assets/index-BKun7ofk.js'), 'utf8');
assert.equal(renderedBundle, committedBundle, 'committed served bundle must match renderServedTrekBundle');

const enLocale = extractEnglishLocaleObject(renderedBundle);
const familyGroups = [
  'dashboard.',
  'nav.',
  'share.',
  'shared.',
  'settings.',
  'trips.',
  'login.',
  'register.',
  'atlas.',
  'trip.',
  'planner.',
  'collab.',
  'day.',
  'files.',
  'photos.',
  'packing.',
  'places.',
  'stats.',
  'members.',
  'memories.',
  'journey.',
  'perm.',
  'notif.',
  'notifications.',
  'backup.',
];
const localeTripHits = [];
const localeSiHits = [];
for (const [key, value] of Object.entries(enLocale)) {
  if (typeof value !== 'string') continue;
  if (!familyGroups.some((prefix) => key.startsWith(prefix))) continue;
  const withoutPlaceholder = value.replace(/\{trip\}/g, '');
  if (TRIP_WORD_RE.test(withoutPlaceholder)) localeTripHits.push([key, value]);
  if (SI_WORD_RE.test(value)) localeSiHits.push([key, value]);
}
assert.deepEqual(localeTripHits, [], `English locale family keys still mention trip: ${JSON.stringify(localeTripHits)}`);
assert.deepEqual(localeSiHits, [], `English locale family keys contain standalone SI: ${JSON.stringify(localeSiHits)}`);

assert.equal(enLocale['dashboard.title'], 'My Vacations');
assert.equal(enLocale['nav.myTrips'], 'My Vacations');
assert.equal(enLocale['nav.trip'], 'Vacation');
assert.ok(enLocale['settings.oauth.modal.scopesHint'].includes('list_trips'));
assert.ok(enLocale['settings.oauth.modal.scopesHint'].includes('get_trip_summary'));
assert.ok(enLocale['settings.oauth.modal.scopesHint'].includes('vacation IDs'));

assert.ok(renderedBundle.includes('children:"Overall vacation budget"'));
assert.ok(renderedBundle.includes('Hl=di=>di==="Vacation total"?"💵":'));
assert.ok(renderedBundle.includes('js({name:"Vacation total",planned:_i,target:Eo,strong:!0})'));
assert.ok(renderedBundle.includes('<p class="muted">Vacation summary</p>'));
assert.ok(renderedBundle.includes('"aria-label":"Switch vacation"'));
assert.ok(renderedBundle.includes('const vDe=[{to:"/trips",label:"Vacations",icon:vc}]'));
assert.equal(renderedBundle.includes('Overall trip budget'), false);
assert.equal(renderedBundle.includes('Trip total'), false);
assert.equal(renderedBundle.includes('<p class="muted">Trip summary</p>'), false);
assert.equal(renderedBundle.includes('"aria-label":"Switch trip"'), false);
assert.equal(renderedBundle.includes('const vDe=[{to:"/trips",label:"Trips",icon:vc}]'), false);

assert.equal(patchVk1080VacationCopy(renderedBundle), renderedBundle, 'patchVk1080VacationCopy must be idempotent');
assert.ok(VACATION_COPY_REPLACEMENTS.length >= 60, 'expected full replacement list');
assert.throws(
  () => patchVk1080VacationCopy('const LX={};'),
  /vk-1080 copy needle missing/,
  'patchVk1080VacationCopy must throw loudly when needles are missing',
);
const firstNeedle = VACATION_COPY_REPLACEMENTS[0][0];
const firstPatch = VACATION_COPY_REPLACEMENTS[0][1];
const missingOne = renderedBundle.replace(firstPatch, '"trips.reminderDisabledHint":"mutated"');
assert.throws(
  () => patchVk1080VacationCopy(missingOne),
  /vk-1080 copy needle missing/,
  'patchVk1080VacationCopy must throw loudly when a single needle is missing',
);
assert.notEqual(firstNeedle, firstPatch);

const surfaceChecks = [
  {
    file: 'public/ts-trip-hero-collapse.js',
    mustHave: ['Collapse vacation header', 'Expand vacation header'],
    mustNotHave: ['Collapse trip header', 'Expand trip header'],
  },
  {
    file: 'src/vacation/chat-trip-entitlement-attach.mjs',
    mustHave: ['The single-vacation plan already has a vacation.', 'Vacation id is required to attach the purchased entitlement.'],
    mustNotHave: ['The single-vacation plan already has a trip.', 'Trip id is required to attach the purchased entitlement.'],
  },
  {
    file: 'src/vacation/collaborators.mjs',
    mustHave: [
      'Owner onboarding session is required for a pre-vacation collaborator invite.',
      'Owner workspace vacation could not be created for collaborator invite.',
      'Owner entitlement could not be attached to workspace vacation.',
    ],
    mustNotHave: [
      'pre-trip collaborator invite',
      'workspace trip could not be created',
      'attached to workspace trip.',
    ],
  },
  {
    file: 'src/vacation/chat-customer-place-search.mjs',
    mustHave: ['Place search needs a vacation destination or a named area in the message.'],
    mustNotHave: ['Place search needs a trip destination'],
  },
  {
    file: 'src/vacation/first-intake-reply.mjs',
    mustHave: [
      'anyone with the vacation link can view plans and photos without signing in',
      'Start the vacation draft anyway, as a short draft.',
    ],
    mustNotHave: [
      'anyone with the trip link',
      'Start the trip draft anyway',
    ],
  },
  {
    file: 'src/vacation/chat-itinerary-edit.mjs',
    mustHave: [
      'Tell the customer itinerary editing is not enabled for this vacation yet.',
      'Tell the customer this demo vacation cannot be edited via chat.',
      'Ask which itinerary place they want to change, using names from the vacation.',
      'Ask which day number on this vacation they mean.',
      'try again after refreshing the vacation.',
      'No unused bar already on this vacation is available to schedule before that dinner.',
    ],
    mustNotHave: [
      'not enabled for this trip yet.',
      'this demo trip cannot be edited via chat.',
      'using names from the trip.',
      'day number on this trip',
      'refreshing the trip.',
      'already on this trip',
    ],
  },
  {
    file: 'src/vacation/live-app-turn.mjs',
    mustHave: [
      'Not on the vacation:',
      'Saved vacation dates:',
      'say they are joining or on the vacation.',
      'Keep the days already on the saved vacation.',
      'Use the saved vacation dates. Do not shorten the vacation.',
      'Do not offer an activity on a day that is not already that activity on the saved vacation. Do not put viewers or editors on the vacation.',
    ],
    mustNotHave: [
      'Not on the trip:',
      'Saved trip dates:',
      'say they are joining or on the trip.',
      'Keep the days already on the saved trip.',
      'Use the saved trip dates. Do not shorten the trip.',
      'activity on the saved trip. Do not put viewers or editors on the trip.',
    ],
  },
];

for (const check of surfaceChecks) {
  const text = readFileSync(join(ROOT, check.file), 'utf8');
  for (const expected of check.mustHave) {
    assert.ok(text.includes(expected), `${check.file} missing expected copy: ${expected}`);
  }
  for (const banned of check.mustNotHave) {
    assert.equal(text.includes(banned), false, `${check.file} still contains old copy: ${banned}`);
  }
  assert.equal(SI_WORD_RE.test(text), false, `${check.file} contains standalone SI`);
}

console.log('test_issue_1080_vacation_copy: ok');
