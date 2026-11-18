import { readFileSync } from 'node:fs';

const rules = JSON.parse(readFileSync(new URL('../fixtures/harness/protected-targets.json', import.meta.url), 'utf8'));

export function isHarnessTag(tag) {
  return /^harness:[a-z0-9][a-z0-9._-]{0,80}:[a-z0-9][a-z0-9._-]{0,80}$/.test(String(tag || ''));
}

export function harnessTag(runId, storyId) {
  const tag = `harness:${String(runId || '').trim()}:${String(storyId || '').trim()}`;
  if (!isHarnessTag(tag)) throw new Error('refused: harness tag is invalid');
  return tag;
}

export function protectedReason(target, source = rules) {
  const tripId = String(target?.tripId ?? target?.trip_id ?? '').trim();
  const share = String(target?.shareToken ?? target?.share_token ?? target?.slug ?? target?.publicSlug ?? '').trim();
  const email = String(target?.email ?? '').trim().toLowerCase();
  const name = String(target?.displayName ?? target?.display_name ?? target?.name ?? '').trim().toLowerCase();
  const local = email.split('@')[0] || '';
  if (tripId && (source.tripIds || []).some((id) => tripId === String(id))) return 'protected-trip';
  const tripKey = tripId.toLowerCase();
  if (tripKey && (source.tripIdPrefixes || []).some((prefix) => tripKey.startsWith(String(prefix).toLowerCase()))) return 'protected-trip';
  const shareKey = share.toUpperCase();
  if (shareKey && (source.sharePrefixes || []).some((prefix) => shareKey.includes(String(prefix).toUpperCase()))) return 'protected-share';
  if (name && (source.names || []).some((item) => name === String(item).toLowerCase() || name.startsWith(`${String(item).toLowerCase()} `))) return 'protected-account';
  if (local && (source.emailLocalParts || []).some((item) => local === String(item).toLowerCase())) return 'protected-account';
  return '';
}

export function assertThrowaway(target, source = rules) {
  const reason = protectedReason(target, source);
  if (reason) throw new Error(`refused: ${reason}`);
  return target;
}

export function cleanupCommand(runId, storyId) {
  return `node scripts/vk-customer-harness.mjs --cleanup-only --run-id ${runId} --story-id ${storyId}`;
}
