#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSharedTripPayload } from '../src/vacation/shared-trip-handler.mjs';
import { GATE_B_APPROVED_SHARED_SLUG } from './fixtures/gate-b-approved-shared-trip.mjs';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const scratch = mkdtempSync(join(tmpdir(), 'gateb-canonical-logos-'));

try {
  const outPath = join(scratch, 'canonical.json');
  execFileSync('node', [join(repoRoot, 'scripts/build_gateb_canonical_shared_trip.mjs'), outPath], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: { ...process.env, DATABASE_URL: '' },
  });
  const built = JSON.parse(readFileSync(outPath, 'utf8'));
  const served = await loadSharedTripPayload(GATE_B_APPROVED_SHARED_SLUG);
  assert.ok(served?.places?.length, 'served payload must have places');

  const servedById = new Map(served.places.map((p) => [p.id, p]));
  const marriottIds = [624, 625, 636, 641];
  for (const id of marriottIds) {
    const ov = built.thingOverrides[`place:${id}`];
    assert.match(String(ov?.logoUrl || ''), /^https:\/\/t2\.gstatic\.com\/faviconV2\?.*marriott\.com/i, `place ${id} override logo`);
    assert.equal(ov.logoUrl, served.thingOverrides[`place:${id}`].logoUrl, `place ${id} override matches served`);
  }
  for (const [id, hostRe] of [[682, /johnsofbleecker\.com/i], [685, /carminesnyc\.com/i]]) {
    const place = built.places.find((p) => p.id === id);
    const ov = built.thingOverrides[`place:${id}`];
    assert.match(String(place?.logoUrl || ''), /^https:\/\/t2\.gstatic\.com\/faviconV2\?/i, `place ${id} place logo`);
    assert.match(String(place?.logoUrl || ''), hostRe, `place ${id} place logo host`);
    assert.equal(ov?.logoUrl, place.logoUrl, `place ${id} override equals place logo`);
    assert.equal(place.logoUrl, servedById.get(id).logoUrl, `place ${id} matches served HTTP payload`);
  }

  for (const place of built.places) {
    const livePlace = servedById.get(place.id);
    assert.equal(place.logoUrl, livePlace?.logoUrl, `place ${place.id} place.logoUrl matches served`);
    assert.equal(
      built.thingOverrides[`place:${place.id}`]?.logoUrl,
      served.thingOverrides[`place:${place.id}`]?.logoUrl,
      `place ${place.id} override.logoUrl matches served`,
    );
  }
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

console.log('gateb canonical replay HTTP logo parity passed');
