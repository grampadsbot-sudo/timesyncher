#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { renderServedTrekBundle } from '../src/vacation/trek-style2-bundle.mjs';

const UPSTREAM_COMMIT = '06e47169699ffdee8accf48e74b0a247a8793ebc^';
const upstreamRaw = execFileSync('git', ['show', `${UPSTREAM_COMMIT}:public/assets/upstream/index-BKun7ofk.js`], {
  maxBuffer: 25 * 1024 * 1024,
}).toString('utf8');
const servedBundle = renderServedTrekBundle(upstreamRaw);

assert.match(
  servedBundle,
  /if\(Ds\(G\)\)s\+=1e4;if\(String\(_l\(G\)\|\|""\)\.trim\(\)\)s\+=1e3/,
  'hotels catalog must prefer timeline + logo rows before Oe() render',
);
assert.match(
  servedBundle,
  /tsFold=\(w,g\)=>/,
  'hotels catalog dedupe must fold description, price and logo from twin rows',
);
assert.match(
  servedBundle,
  /if\(!spec\)\{return fillThing\(\{\.\.\.\(base\|\|\{\}\)\}\)\}/,
  'ha() must merge catalog place fields when thingOverrides lack summary, price, or longDetails',
);
assert.match(
  servedBundle,
  /pick\(G\.summary\?\?G\.description\?\?G\.longDetails\?\?""\)/,
  'list row summary must fall back to merged place fields after twin fold',
);
assert.doesNotMatch(
  servedBundle,
  /kn=ze\.length\?Po\.filter\(G=>ze\.includes\(En\(G\)\)\):Po,tsPad/,
  'hotels kn must not pass unfiltered duplicate Po rows',
);

const committed = readFileSync(
  fileURLToPath(new URL('../public/assets/index-BKun7ofk.js', import.meta.url)),
  'utf8',
);
assert.equal(committed, servedBundle, 'committed served bundle must match renderServedTrekBundle');

console.log('shared hotels tab catalog dedupe tests passed');
