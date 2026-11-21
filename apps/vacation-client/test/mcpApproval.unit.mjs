import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  changeSetKindLabel,
  changeSetStatusLabel,
  extractApprovalPreviewView,
  formatMediaBytes,
  formatMediaMatchLabel,
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

const previewView = extractApprovalPreviewView({
  previewHash: 'abc123',
  preview: {
    preview_hash: 'abc123',
    days: [{ day_number: 1, date: '2026-07-03', title: 'Arrival', items: [{ title: 'Harbor Cafe', scheduled: true }] }],
    unscheduled_things: [{ category: 'store', title: 'River Books', scheduled: false }],
    media: [{
      media_id: 'm1',
      filename: 'sunset.jpg',
      bytes: 4096,
      attached_day_date: '2026-07-03',
      attached_day_number: 1,
      attached_thing_title: 'Harbor Cafe',
      attached_thing_scheduled: true,
      exif_match: { time_matched: true, gps_matched: true, gps_distance_meters: 18 },
    }],
    total_bytes: 4096,
  },
});
assert.equal(previewView.previewHash, 'abc123');
assert.equal(previewView.days.length, 1);
assert.equal(previewView.unscheduledThings.length, 1);
assert.equal(previewView.totalBytes, 4096);
const mediaLabel = formatMediaMatchLabel(previewView.media[0]);
assert.match(mediaLabel, /Day 1 \(2026-07-03\)/);
assert.match(mediaLabel, /Harbor Cafe/);
assert.match(mediaLabel, /EXIF time \+ EXIF GPS 18m/);

const joined = [
  changeSetStatusLabel('pending_approval'),
  changeSetKindLabel('draft_import'),
  changeSetKindLabel('targeted_edit'),
  mediaLabel,
  ...draftBullets,
  ...editBullets,
].join(' ');
assert.doesNotMatch(joined, /\btrips?\b/i);
assert.doesNotMatch(joined, /\btravel\w*\b/i);
assert.doesNotMatch(joined, /\bSI\b/);

const headerSource = await readFile(new URL('../src/components/TripHeaderActions.tsx', import.meta.url), 'utf8');
assert.match(headerSource, /Vacation View/);
assert.doesNotMatch(headerSource, />Trip View</);
assert.doesNotMatch(headerSource, /AI Access &amp; Approvals/);

const shellSource = await readFile(new URL('../src/components/TripShell.tsx', import.meta.url), 'utf8');
assert.match(shellSource, /data-ts-vacation-grid-root/);
assert.match(shellSource, /AI Access &amp; Approvals/);
assert.match(shellSource, /\['flights', 'cars', 'hotels'\]/);

const panelSource = await readFile(new URL('../src/components/McpApprovalPanel.tsx', import.meta.url), 'utf8');
assert.match(panelSource, /handleApprove\(selected\.id, previewView\.previewHash\)/);
assert.match(panelSource, /item\.expiresAt/);
assert.doesNotMatch(panelSource, /Media attachments/i);
assert.match(panelSource, /Not placed yet/);

const apiSource = await readFile(new URL('../src/api/mcpAdmin.ts', import.meta.url), 'utf8');
assert.match(apiSource, /preview_hash: previewHash/);

const livePanelSource = await readFile(new URL('../../../public/ts-mcp-ai-access.js', import.meta.url), 'utf8');
assert.match(livePanelSource, /__tsOpenMcpPanel/);
assert.match(livePanelSource, /preview_hash: previewHash/);
assert.match(livePanelSource, /Unscheduled long-list items/);
assert.doesNotMatch(livePanelSource, /Media attachments/i);
assert.match(livePanelSource, /Not placed yet/);
assert.match(livePanelSource, /data-ts-preview-thumb/);
assert.doesNotMatch(livePanelSource, /\btrips?\b/i);

console.log('mcpApproval.unit.mjs passed');
