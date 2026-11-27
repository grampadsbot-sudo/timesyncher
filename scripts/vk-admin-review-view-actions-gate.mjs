import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ADMIN_REVIEW = path.join(ROOT, 'public/vk-admin-review.js');
export function duplicateViewActionFailures(source = '') {
  const text = String(source || '');
  const failures = [];
  if (/\badmin-keepsake-actions\b/.test(text)) failures.push('admin-keepsake-actions');
  const keepsake = text.match(/function keepsake\([\s\S]*?\n  \}/);
  if (keepsake && /data-(?:keepsake-pdf|keepsake-generate)/.test(keepsake[0])) {
    failures.push('keepsake-view-panel-actions');
  }
  const dialog = text.match(/function dialog\([\s\S]*?\n  \}/);
  if (dialog && /data-dialog-pdf/.test(dialog[0])) failures.push('dialog-view-panel-actions');
  if (!/function viewMenuActions/.test(text) && /data-(?:dialog-pdf|keepsake-pdf|keepsake-generate)/.test(text)) {
    failures.push('missing-view-menu-actions');
  }
  return failures;
}

export function assertVkAdminReviewViewActions(source) {
  const failures = duplicateViewActionFailures(source);
  if (failures.length) {
    throw new Error(`vk admin duplicate view actions: ${failures.join(', ')}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const source = fs.readFileSync(ADMIN_REVIEW, 'utf8');
  assertVkAdminReviewViewActions(source);
  console.log('vk admin review view actions gate passed');
}