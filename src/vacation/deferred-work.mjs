import { waitUntil } from '@vercel/functions';

export function scheduleBackgroundWork(work) {
  if (typeof work !== 'function') {
    throw new TypeError('scheduleBackgroundWork requires a function that returns a promise');
  }
  if (typeof waitUntil !== 'function') {
    throw new Error('@vercel/functions waitUntil is not available in this runtime');
  }
  const backgroundPromise = (async () => await work())().catch((error) => {
    console.error(JSON.stringify({
      event: 'background_work_failed',
      message: String(error?.message || error || ''),
    }));
    throw error;
  });
  waitUntil(backgroundPromise);
  return backgroundPromise;
}
