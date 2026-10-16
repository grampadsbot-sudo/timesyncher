#!/usr/bin/env node
import { assertGateBCaptureCoverageSelftest } from './lib/gate-b-capture-coverage-selftest.mjs';

await assertGateBCaptureCoverageSelftest();
console.log('gate b capture coverage selftest passed');
