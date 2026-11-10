export function chatReplyPostgenTimeoutMs(env = process.env) {
  const raw = Number(env.CHAT_REPLY_POSTGEN_TIMEOUT_MS);
  if (Number.isFinite(raw) && raw > 0) return Math.min(raw, 45_000);
  return 12_000;
}

export async function boundedAwait(promise, timeoutMs, onTimeout = null) {
  const ms = Math.max(1, Number(timeoutMs) || 1);
  let timer = null;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => {
      if (typeof onTimeout === 'function') resolve(onTimeout());
      else resolve({ timedOut: true });
    }, ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
