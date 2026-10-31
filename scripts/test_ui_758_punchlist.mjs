#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

import { renderServedTrekBundle } from '../src/vacation/trek-style2-bundle.mjs';
import { visibleLogoDomCheckSource } from '../src/vacation/shared-trip-logo-audit.mjs';

const UPSTREAM_COMMIT = '06e47169699ffdee8accf48e74b0a247a8793ebc^';
const raw = execFileSync('git', ['show', `${UPSTREAM_COMMIT}:public/assets/upstream/index-BKun7ofk.js`], {
  maxBuffer: 25 * 1024 * 1024,
});

const bundle = renderServedTrekBundle(raw.toString('utf8'));
const committed = readFileSync(new URL('../public/assets/index-BKun7ofk.js', import.meta.url), 'utf8');
assert.equal(bundle, committed, 'committed served bundle must match renderServedTrekBundle');

assert.match(bundle, /tsLogoFallback/);
assert.match(bundle, /icons\.duckduckgo\.com\/ip3\//);
assert.match(bundle, /gstatic\.com\/faviconV2/);
assert.match(bundle, /ic&&ic!=="\?"\?ic:wl\(G\)/);
assert.match(visibleLogoDomCheckSource(), /pass: bad.length === 0/);

const dcSnippet = bundle.slice(bundle.indexOf('dc=({item:G,size:Re=28})'), bundle.indexOf('dc=({item:G,size:Re=28})') + 1200);
assert.match(dcSnippet, /tsLogoFallback/);
assert.doesNotMatch(dcSnippet, /onError:Rn=>\{const ua=Rn\.currentTarget;ua\.style\.display="none"/);

console.log('ui #758 punchlist checks passed');
