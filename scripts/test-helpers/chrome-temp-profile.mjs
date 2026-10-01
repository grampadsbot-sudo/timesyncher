import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

export async function createChromeProfileDir(prefix = 'chrome-profile-') {
  return mkdtemp(path.join(tmpdir(), prefix));
}

export async function removeChromeProfileDir(dir) {
  if (!dir) return;
  try {
    await rm(dir, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 });
  } catch (error) {
    if (error?.code === 'ENOTEMPTY' || error?.code === 'EBUSY' || error?.code === 'EPERM') return;
    throw error;
  }
}
