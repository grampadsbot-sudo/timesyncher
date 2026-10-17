import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export async function assertTemporaryJavaScriptParses(source, message) {
  const directory = await mkdtemp(join(tmpdir(), 'javascript-syntax-'));
  try {
    const filename = join(directory, 'bundle.js');
    await writeFile(filename, source);
    const checked = spawnSync(process.execPath, ['--check', filename], { encoding: 'utf8' });
    assert.equal(checked.status, 0, checked.stderr || message);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
