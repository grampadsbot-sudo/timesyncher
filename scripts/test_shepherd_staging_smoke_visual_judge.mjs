import assert from 'node:assert/strict';
import { parseVisualJudgeResponseText } from './shepherd-staging-smoke-visual-judge.mjs';

assert.deepEqual(parseVisualJudgeResponseText('{"pass":true,"failures":[]}'), { pass: true, failures: [] });
assert.throws(() => parseVisualJudgeResponseText('{"pass":true,"failures":[{"x":1}]}'), /invalid failure row/);

console.log(JSON.stringify({ ok: true }));
