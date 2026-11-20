import assert from 'node:assert/strict';
import {
  changeSetKindLabel,
  changeSetStatusLabel,
  formatMediaBytes,
  previewSummaryBullets,
  sortChangeSetsForReview,
} from '../src/lib/mcpPanelModel.mjs';

assert.equal(changeSetStatusLabel('pending_approval'), 'Pending approval');
assert.equal(changeSetStatusLabel('approved'), 'Approved');
assert.equal(changeSetStatusLabel('declined'), 'Declined');
assert.equal(changeSetStatusLabel('draft'), 'Draft');

assert.equal(changeSetKindLabel('draft_import'), 'Vacation draft import');
assert.equal(changeSetKindLabel('targeted_edit'), 'Targeted vacation edit');

assert.equal(formatMediaBytes(0), '0 B');
assert.equal(formatMediaBytes(512), '512 B');
assert.equal(formatMediaBytes(2048), '2.0 KB');
assert.equal(formatMediaBytes(2 * 1024 * 1024), '2.0 MB');

const draftBullets = previewSummaryBullets({
  preview: {
    kind: 'draft_import',
    will_create: {
      vacation: { title: 'Astoria Coast Weekend', destination: 'Astoria, OR' },
      days: [{ day_number: 1, date: '2026-07-03' }],
      flights: [{ title: 'AS 412' }],
      media: [{ media_id: 'm1', filename: 'a.jpg' }],
    },
  },
});
assert.ok(draftBullets.includes('Vacation: Astoria Coast Weekend — Astoria, OR'));
assert.ok(draftBullets.includes('Days: 1'));
assert.ok(draftBullets.includes('Flights: 1'));
assert.ok(draftBullets.includes('Photos & videos: 1'));

const editBullets = previewSummaryBullets({
  preview: {
    kind: 'targeted_edit',
    will_add: [{ category: 'activity', title: 'Kayak Tour' }],
    will_update: [{ item_id: 'i1', current_title: 'Cafe', changed_fields: ['title'] }],
    will_remove: [{ item_id: 'i2', category: 'note', title: 'Old Note' }],
  },
});
assert.equal(editBullets.length, 3);

const sorted = sortChangeSetsForReview([
  { id: '1', status: 'declined', createdAt: '2026-07-05T00:00:00Z' },
  { id: '2', status: 'pending_approval', createdAt: '2026-07-03T00:00:00Z' },
  { id: '3', status: 'approved', createdAt: '2026-07-04T00:00:00Z' },
]);
assert.deepEqual(sorted.map((item) => item.id), ['2', '3', '1']);

const joined = [
  changeSetStatusLabel('pending_approval'),
  changeSetKindLabel('draft_import'),
  changeSetKindLabel('targeted_edit'),
  ...draftBullets,
  ...editBullets,
].join(' ');
assert.doesNotMatch(joined, /\btrips?\b/i);
assert.doesNotMatch(joined, /\btravel\w*\b/i);
assert.doesNotMatch(joined, /\bSI\b/);

console.log('mcpApproval.unit.mjs passed');
