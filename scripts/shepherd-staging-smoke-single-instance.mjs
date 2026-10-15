import { closeSync, existsSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';

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

function tryWriteLock(lockPath) {
  try {
    const fd = openSync(lockPath, 'wx');
    writeFileSync(fd, `${process.pid}\n`);
    closeSync(fd);
    return true;
  } catch (err) {
    if (err?.code === 'EEXIST') return false;
    throw err;
  }
}

export function acquireShepherdStagingSmokeLock(lockPath = DEFAULT_LOCK_PATH) {
  if (tryWriteLock(lockPath)) {
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

  const existing = readLockPid(lockPath);
  if (existing && existing !== process.pid && pidAlive(existing)) {
    const err = new Error(`shepherd-staging-smoke already running (pid ${existing})`);
    err.code = 'SMOKE_LOCK_HELD';
    throw err;
  }
  if (existsSync(lockPath)) {
    try {
      unlinkSync(lockPath);
    } catch (unlinkErr) {
      void unlinkErr;
    }
  }
  if (!tryWriteLock(lockPath)) {
    const err = new Error('shepherd-staging-smoke lock could not be acquired');
    err.code = 'SMOKE_LOCK_HELD';
    throw err;
  }
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
