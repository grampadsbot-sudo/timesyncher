#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

import {
  logoImgOnErrorInline,
  logoImgOnLoadInline,
  repairExplicitLogoUrl,
} from '../src/vacation/thing-logo-fallback-url.mjs';
import {
  logoChipFallbackStackDomCheckSource,
  visibleLogoDomCheckSource,
} from '../src/vacation/shared-trip-logo-audit.mjs';
import { renderServedTrekBundle } from '../src/vacation/trek-style2-bundle.mjs';

assert.match(logoImgOnLoadInline(), /if\(fb\)fb\.style\.display='none'/);
assert.match(logoImgOnErrorInline(), /if\(fb\)\{fb\.style\.display='grid'/);
assert.match(visibleLogoDomCheckSource(), /fallback_stack/);
assert.match(logoChipFallbackStackDomCheckSource(), /fallback_stack/);

assert.equal(
  repairExplicitLogoUrl('https://www.marriott.com/favicon.ico'),
  'https://t2.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https%3A%2F%2Fwww.marriott.com&size=64',
);

const UPSTREAM_COMMIT = '06e47169699ffdee8accf48e74b0a247a8793ebc^';
const raw = execFileSync('git', ['show', `${UPSTREAM_COMMIT}:public/assets/upstream/index-BKun7ofk.js`], {
  maxBuffer: 25 * 1024 * 1024,
});
const bundle = renderServedTrekBundle(raw.toString('utf8'));
const committed = readFileSync(new URL('../public/assets/index-BKun7ofk.js', import.meta.url), 'utf8');
assert.equal(bundle, committed, 'committed served bundle must match renderServedTrekBundle');
assert.match(bundle, /display:zt\?"none":"grid"/);

console.log('ui #884 logo chip fallback hide tests passed');
