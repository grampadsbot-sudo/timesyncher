const upstreamSharedCache = new Map();

const DEFAULT_TTL_MS = 300_000;

export function sharedUpstreamCacheKey(shareToken, queryString = '') {
  return `${String(shareToken || '')}?${String(queryString || '')}`;
}

export function readCachedUpstreamShared(key) {
  const row = upstreamSharedCache.get(key);
  if (!row) return null;
  if (row.expiresAt <= Date.now()) {
    upstreamSharedCache.delete(key);
    return null;
  }
  return row.value;
}

export function writeCachedUpstreamShared(key, value, ttlMs = DEFAULT_TTL_MS) {
  upstreamSharedCache.set(key, {
    value,
    expiresAt: Date.now() + Math.max(1000, Number(ttlMs) || DEFAULT_TTL_MS),
  });
}

export function resetSharedUpstreamCacheForTests() {
  upstreamSharedCache.clear();
}
