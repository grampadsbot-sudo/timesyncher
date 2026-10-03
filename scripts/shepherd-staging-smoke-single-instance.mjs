import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';

const DEFAULT_LOCK_PATH = '/tmp/shepherd-staging-smoke.lock';

function readLockPid(lockPath) {
  try {
    const raw = readFileSync(lockPath, 'utf8').trim();
    const pid = Number.parseInt(raw, 10);
    return Number.isFinite(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

function pidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err?.code === 'EPERM';
  }
}

/**
 * Fail closed when another shepherd-staging-smoke instance holds the lock.
 * @returns {{ release: () => void }}
 */
export function acquireShepherdStagingSmokeLock(lockPath = DEFAULT_LOCK_PATH) {
  const existing = readLockPid(lockPath);
  if (existing && existing !== process.pid && pidAlive(existing)) {
    const err = new Error(`shepherd-staging-smoke already running (pid ${existing})`);
    err.code = 'SMOKE_LOCK_HELD';
    throw err;
  }
  if (existing && !pidAlive(existing)) {
    try {
      unlinkSync(lockPath);
    } catch (unlinkErr) {
      void unlinkErr;
    }
  }
  writeFileSync(lockPath, `${process.pid}\n`);
  const release = () => {
    try {
      const holder = readLockPid(lockPath);
      if (holder === process.pid) unlinkSync(lockPath);
    } catch (releaseErr) {
      void releaseErr;
    }
  };
  process.once('exit', release);
  return { release };
}

export function isSmokeLockHeldError(err) {
  return err?.code === 'SMOKE_LOCK_HELD' || /already running/i.test(String(err?.message || err));
}
