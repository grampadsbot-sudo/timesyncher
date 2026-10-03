import assert from 'node:assert/strict';
import { parseVisualJudgeResponseText, VISUAL_JUDGE_MODEL } from './shepherd-staging-smoke-visual-judge.mjs';

assert.equal(VISUAL_JUDGE_MODEL, 'qwen/qwen2.5-vl-72b-instruct');
assert.deepEqual(parseVisualJudgeResponseText('{"pass":true,"failures":[]}'), { pass: true, failures: [] });
assert.throws(() => parseVisualJudgeResponseText('{"pass":true,"failures":[{"x":1}]}'), /invalid failure row/);

console.log(JSON.stringify({ ok: true }));
