import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

function sha256File(filePath) {
  const body = readFileSync(filePath);
  return createHash('sha256').update(body).digest('hex');
}

export function verifyReviewedStepBPins(options = {}) {
  const collectorRoot = options.collectorRoot || '';
  const pinsPath = options.pinsPath;
  if (!pinsPath) {
    return {
      ok: false,
      faults: ['DATA-CONTRACT: step-b pin bundle path missing'],
      observed: {},
    };
  }
  const pin = JSON.parse(readFileSync(pinsPath, 'utf8'));
  const files = pin.files || {};
  const faults = [];
  const observed = {};
  for (const [rel, expected] of Object.entries(files)) {
    const resolved = path.resolve(collectorRoot, rel);
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
    pinsPath,
    collectorRoot: collectorRoot || null,
    bundleSha256: pin.bundle_sha256 || null,
    observed,
    faults,
  };
}

export function verifyCaptureCollectorPin(options = {}) {
  const patchedCapturePath = options.patchedCapturePath;
  const expected = options.expectedSha256;
  if (!patchedCapturePath || !expected) {
    return {
      ok: false,
      observed: null,
      expected: expected || null,
      faults: ['DATA-CONTRACT: capture collector pin inputs missing'],
    };
  }
  let observed;
  try {
    observed = sha256File(patchedCapturePath);
  } catch {
    return {
      ok: false,
      observed: null,
      expected,
      faults: ['DATA-CONTRACT: patched capture collector missing'],
    };
  }
  const ok = observed === expected;
  const faults = ok
    ? []
    : [`DATA-CONTRACT: capture collector sha256 mismatch reviewed=${expected.slice(0, 12)} runtime=${observed.slice(0, 12)}`];
  return { ok, observed, expected, faults };
}
