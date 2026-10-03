export function scheduleBackgroundWork(work) {
  if (typeof work !== 'function') return;
  void (async () => {
    try {
      const mod = await import('@vercel/functions').catch(() => null);
      const run = async () => {
        try {
          await work();
        } catch (error) {
          console.error(JSON.stringify({
            event: 'background_work_failed',
            message: String(error?.message || error || ''),
          }));
        }
      };
      if (typeof mod?.waitUntil === 'function') void mod.waitUntil(run());
      else await run();
    } catch (error) {
      console.error(JSON.stringify({
        event: 'background_work_failed',
        message: String(error?.message || error || ''),
      }));
    }
  })();
}
