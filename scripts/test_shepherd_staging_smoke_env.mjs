#!/usr/bin/env node
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { unwrapVercelEnvPlainValue } from './shepherd-staging-smoke-env.mjs';
import { layoutNycReferenceDir } from './shepherd-staging-smoke-layout-nyc.mjs';

assert.equal(unwrapVercelEnvPlainValue('plain'), 'plain');
assert.equal(unwrapVercelEnvPlainValue('"quoted-plain"'), 'quoted-plain');
assert.equal(unwrapVercelEnvPlainValue(' "spaced" '), 'spaced');
assert.equal(unwrapVercelEnvPlainValue('"not-closed'), '"not-closed');

const defaultRef = layoutNycReferenceDir({});
assert.equal(
  defaultRef,
  join(fileURLToPath(new URL('.', import.meta.url)), 'fixtures/nyc-final-reference'),
);

console.log('shepherd staging smoke env tests passed');
