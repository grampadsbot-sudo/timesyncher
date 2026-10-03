async function registerWaitUntil(backgroundPromise) {
  try {
    const { waitUntil } = await import('@vercel/functions');
    if (typeof waitUntil !== 'function') {
      throw new Error('@vercel/functions waitUntil is not available in this runtime');
    }
    waitUntil(backgroundPromise);
  } catch (error) {
    console.error(JSON.stringify({
      event: 'background_wait_until_unavailable',
      message: String(error?.message || error || ''),
    }));
  }
}

export function scheduleBackgroundWork(work) {
  if (typeof work !== 'function') {
    throw new TypeError('scheduleBackgroundWork requires a function that returns a promise');
  }
  const backgroundPromise = (async () => await work())().catch((error) => {
    console.error(JSON.stringify({
      event: 'background_work_failed',
      message: String(error?.message || error || ''),
    }));
    throw error;
  });

  void registerWaitUntil(backgroundPromise);

  return backgroundPromise;
}
