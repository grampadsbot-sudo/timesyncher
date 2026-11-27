#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { adminReplyGrade } from '../src/vacation/vk-admin-review-data.mjs';
import { cannedWelcomeLiveTurn } from '../src/vacation/onboarding-welcome.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const adminJs = fs.readFileSync(path.join(root, 'public/vk-admin-review.js'), 'utf8');

function assertAdminDialogGradeGate(html) {
  const blocks = html.split(/(?=<article class="bubble)/).filter((chunk) => chunk.includes('<article class="bubble'));
  for (const block of blocks) {
    if (/class="bubble user"/.test(block.split('</article>')[0] || '')) continue;
    if (!block.includes('data-admin-turn-grade=')) {
      throw new Error('assistant turn missing data-admin-turn-grade');
    }
    if (block.includes('data-admin-turn-grade="not-graded"')) continue;
    if (!block.includes('data-jev-score') || !block.includes('data-qa-verdict')) {
      throw new Error('graded assistant turn missing Jev score or QA verdict');
    }
  }
}

assert.match(adminJs, /maximumFractionDigits: 2/);
assert.doesNotMatch(adminJs, /admin-dialog-head[\s\S]*data-dialog-pdf/);
assert.match(adminJs, /data-dialog-pdf="1"/);

const opener = {
  speaker: 'app',
  direction: 'outbound',
  fixedOpener: true,
  payload: { liveTranscript: cannedWelcomeLiveTurn({ text: 'Welcome', at: '2026-11-26T00:00:00.000Z' }) },
};
assert.deepEqual(adminReplyGrade(opener), { notGraded: true, reason: 'fixed_onboarding_opener' });

const graded = {
  speaker: 'app',
  direction: 'outbound',
  payload: {
    liveTranscript: {
      quality: { judged: true, score: 4.12, disposition: 'keep' },
      jevDisposition: 'keep',
    },
  },
};
assert.deepEqual(adminReplyGrade(graded), { notGraded: false, jevScore: '4.12', qaVerdict: 'keep' });

const missing = {
  speaker: 'app',
  direction: 'outbound',
  payload: { liveTranscript: { quality: { judged: false } } },
};
assert.deepEqual(adminReplyGrade(missing), { notGraded: true });

assert.throws(
  () => assertAdminDialogGradeGate('<article class="bubble"></article><p class="admin-reply-detail">x</p>'),
  /missing data-admin-turn-grade/,
);
assert.doesNotThrow(() => assertAdminDialogGradeGate('<article class="bubble user"><p>c</p></article>'));
assert.throws(
  () => assertAdminDialogGradeGate('<article class="bubble"></article><p data-admin-turn-grade="graded"></p>'),
  /missing Jev score/,
);
assertAdminDialogGradeGate(
  '<article class="bubble user"><p>c</p></article>'
    + '<article class="bubble"></article><p data-admin-turn-grade="not-graded">not graded</p>'
    + '<article class="bubble"></article><p class="admin-reply-detail">m</p>'
    + '<p data-admin-turn-grade="graded"><span data-jev-score>4</span><span data-qa-verdict>keep</span></p>',
);

console.log('test_vk_admin_dialog_pdf_cost_jev: ok');