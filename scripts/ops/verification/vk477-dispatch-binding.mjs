import { spawnSync } from 'node:child_process';

const defaultDispatchRoot = '/home/ubishere9995/tsv-dispatch';

function dispatchRoot() {
  return process.env.VK_DISPATCH_ROOT || defaultDispatchRoot;
}

function runPython(payload) {
  const code = `
import json, sys
sys.path.insert(0, ${JSON.stringify(dispatchRoot())})
payload = json.loads(sys.stdin.read())
import build_head_fixture, tsv_dispatch
if payload['op'] == 'build':
    out = build_head_fixture.build(payload['base'], payload['snapshot'], payload['out'])
    print(json.dumps({'out': out}))
elif payload['op'] == 'faults':
    faults = tsv_dispatch._capture_payload_faults(payload['snapshot'], payload['fixture'])
    print(json.dumps({'faults': faults}))
else:
    raise SystemExit('unknown op')
`;
  const r = spawnSync('python3', ['-c', code], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  if (r.status !== 0) {
    throw new Error((r.stderr || r.stdout || 'python binding failed').trim());
  }
  return JSON.parse(r.stdout.trim());
}

export function buildHeadCaptureFixture(basePath, snapshotPath, outPath) {
  const result = runPython({
    op: 'build',
    base: basePath,
    snapshot: snapshotPath,
    out: outPath,
  });
  return result.out;
}

export function capturePayloadFaults(snapshotPath, fixturePath) {
  return runPython({
    op: 'faults',
    snapshot: snapshotPath,
    fixture: fixturePath,
  }).faults;
}

export function bindingVerdict(snapshotPath, fixturePath) {
  const faults = capturePayloadFaults(snapshotPath, fixturePath);
  if (faults.length) {
    return { overall: 'DATA_FAULT', faults };
  }
  return { overall: 'PASS', faults: [] };
}
