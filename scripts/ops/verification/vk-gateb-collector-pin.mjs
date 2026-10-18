import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const defaultPinsUrl = new URL('./reviewed-ec4d40de-runtime-input-pins.json', import.meta.url);

function sha256File(filePath) {
  const body = readFileSync(filePath);
  return createHash('sha256').update(body).digest('hex');
}

export function verifyReviewedCollectorPins(options = {}) {
  const pinsUrl = options.pinsUrl || defaultPinsUrl;
  const collectorRoot = options.collectorRoot || process.env.VK_GATEB_COLLECTOR_ROOT || '';
  const pins = JSON.parse(readFileSync(pinsUrl, 'utf8'));
  const faults = [];
  const observed = {};
  for (const [rel, expected] of Object.entries(pins)) {
    const resolved = collectorRoot ? path.resolve(collectorRoot, rel) : null;
    if (!resolved) {
      faults.push(`DATA-CONTRACT: collector root unset for pin ${rel}`);
      continue;
    }
    let actual;
    try {
      actual = sha256File(resolved);
    } catch {
      faults.push(`DATA-CONTRACT: collector pin target missing: ${rel}`);
      continue;
    }
    observed[rel] = actual;
    if (actual !== expected) {
      faults.push(
        `DATA-CONTRACT: collector ${rel} sha256 mismatch reviewed=${expected.slice(0, 12)} runtime=${actual.slice(0, 12)}`,
      );
    }
  }
  return {
    ok: faults.length === 0,
    checkerCommit: 'ec4d40de',
    pinsPath: fileURLToPath(pinsUrl),
    collectorRoot: collectorRoot || null,
    observed,
    faults,
  };
}
