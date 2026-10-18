import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

function sha256File(filePath) {
  const body = readFileSync(filePath);
  return createHash('sha256').update(body).digest('hex');
}

function sha256Text(text) {
  return createHash('sha256').update(text).digest('hex');
}

function normalizeCollectorFunctionSource(source) {
  return source.split('\n').map((line) => line.trim()).filter(Boolean).join('\n');
}

function extractCaptureNameTextFunction(captureBody) {
  const match = captureBody.match(/function captureNameText\(nameEl\)\s*\{[\s\S]*?\n\s{6}\}/);
  return match ? match[0] : null;
}

function applyCaptureNameLinePatch(baseCapturePath, patchPath) {
  const work = mkdtempSync(path.join(tmpdir(), 'vk477-patch-'));
  try {
    writeFileSync(path.join(work, 'capture.mjs'), readFileSync(baseCapturePath));
    const patchRun = spawnSync('patch', ['-p1'], {
      cwd: work,
      input: readFileSync(patchPath),
      encoding: 'buffer',
    });
    if (patchRun.status !== 0) {
      return {
        ok: false,
        fault: `DATA-CONTRACT: capture-name-line.patch apply failed: ${(patchRun.stderr || '').toString().slice(-120)}`,
      };
    }
    const patchedBody = readFileSync(path.join(work, 'capture.mjs'), 'utf8');
    return { ok: true, patchedBody, patchedSha256: sha256Text(patchedBody) };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
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
  const collectorRoot = options.collectorRoot || '';
  const helperPath = options.helperPath || path.join(collectorRoot, 'lib/capture-name-line.mjs');
  const patchPath = options.patchPath || path.join(collectorRoot, 'capture-name-line.patch');
  const baseCapturePath = options.baseCapturePath;
  const patchedCapturePath = options.patchedCapturePath;
  const expectedHelperSha256 = options.expectedHelperSha256 || options.expectedSha256;
  const expectedPatchSha256 = options.expectedPatchSha256;
  const expectedBaseCaptureSha256 = options.expectedBaseCaptureSha256;

  const faults = [];
  const observed = {
    helperSha256: null,
    patchSha256: null,
    baseCaptureSha256: null,
    patchedCaptureSha256: null,
    injectedFunctionSha256: null,
  };

  if (!expectedHelperSha256 || !expectedPatchSha256 || !expectedBaseCaptureSha256) {
    return {
      ok: false,
      observed,
      expected: {
        helperSha256: expectedHelperSha256 || null,
        patchSha256: expectedPatchSha256 || null,
        baseCaptureSha256: expectedBaseCaptureSha256 || null,
      },
      faults: ['DATA-CONTRACT: capture collector pin inputs missing'],
    };
  }

  let helperSha256;
  try {
    helperSha256 = sha256File(helperPath);
    observed.helperSha256 = helperSha256;
  } catch {
    return {
      ok: false,
      observed,
      expected: {
        helperSha256: expectedHelperSha256,
        patchSha256: expectedPatchSha256,
        baseCaptureSha256: expectedBaseCaptureSha256,
      },
      faults: ['DATA-CONTRACT: reviewed capture-name-line helper missing'],
    };
  }
  if (helperSha256 !== expectedHelperSha256) {
    faults.push(
      `DATA-CONTRACT: capture helper sha256 mismatch reviewed=${expectedHelperSha256.slice(0, 12)} runtime=${helperSha256.slice(0, 12)}`,
    );
  }

  let patchSha256;
  try {
    patchSha256 = sha256File(patchPath);
    observed.patchSha256 = patchSha256;
  } catch {
    faults.push('DATA-CONTRACT: capture-name-line.patch missing');
  }
  if (patchSha256 && patchSha256 !== expectedPatchSha256) {
    faults.push(
      `DATA-CONTRACT: capture patch sha256 mismatch reviewed=${expectedPatchSha256.slice(0, 12)} runtime=${patchSha256.slice(0, 12)}`,
    );
  }

  let baseCaptureSha256;
  try {
    baseCaptureSha256 = sha256File(baseCapturePath);
    observed.baseCaptureSha256 = baseCaptureSha256;
  } catch {
    faults.push('DATA-CONTRACT: canonical base capture.mjs missing');
  }
  if (baseCaptureSha256 && baseCaptureSha256 !== expectedBaseCaptureSha256) {
    faults.push(
      `DATA-CONTRACT: base capture sha256 mismatch reviewed=${expectedBaseCaptureSha256.slice(0, 12)} runtime=${baseCaptureSha256.slice(0, 12)}`,
    );
  }

  if (!patchSha256 || !baseCaptureSha256 || faults.length > 0) {
    return {
      ok: false,
      observed,
      expected: {
        helperSha256: expectedHelperSha256,
        patchSha256: expectedPatchSha256,
        baseCaptureSha256: expectedBaseCaptureSha256,
      },
      faults,
    };
  }

  const applied = applyCaptureNameLinePatch(baseCapturePath, patchPath);
  if (!applied.ok) {
    faults.push(applied.fault);
    return {
      ok: false,
      observed,
      expected: {
        helperSha256: expectedHelperSha256,
        patchSha256: expectedPatchSha256,
        baseCaptureSha256: expectedBaseCaptureSha256,
      },
      faults,
    };
  }

  const injected = extractCaptureNameTextFunction(applied.patchedBody);
  if (!injected) {
    faults.push('DATA-CONTRACT: patched capture missing captureNameText function');
  } else {
    const helperBody = readFileSync(helperPath, 'utf8');
    const injectedNorm = normalizeCollectorFunctionSource(injected);
    const helperNorm = normalizeCollectorFunctionSource(helperBody);
    observed.injectedFunctionSha256 = sha256Text(injectedNorm);
    if (injectedNorm !== helperNorm) {
      faults.push('DATA-CONTRACT: patched captureNameText does not match reviewed helper');
    }
  }

  if (patchedCapturePath) {
    try {
      observed.patchedCaptureSha256 = sha256File(patchedCapturePath);
      if (observed.patchedCaptureSha256 !== applied.patchedSha256) {
        faults.push(
          `DATA-CONTRACT: job patched capture output mismatch reapplied=${applied.patchedSha256.slice(0, 12)} recorded=${observed.patchedCaptureSha256.slice(0, 12)}`,
        );
      }
      if (observed.patchedCaptureSha256 === expectedHelperSha256) {
        faults.push('DATA-CONTRACT: whole patched capture must not match helper pin');
      }
    } catch {
      faults.push('DATA-CONTRACT: job patched capture output missing');
    }
  }

  return {
    ok: faults.length === 0,
    observed,
    expected: {
      helperSha256: expectedHelperSha256,
      patchSha256: expectedPatchSha256,
      baseCaptureSha256: expectedBaseCaptureSha256,
    },
    faults,
  };
}
