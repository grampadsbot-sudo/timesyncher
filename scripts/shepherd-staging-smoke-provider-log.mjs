/** Collect providerLog rows from itinerary payloads and fail loudly on HTTP 429. */

function finiteMs(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function providerCallTimestampMs(row = {}) {
  return finiteMs(row.calledAtMs ?? row.atMs ?? row.timestampMs ?? row.startedAtMs);
}

function pushRowsFromProviderArray(rows, source, into) {
  if (!Array.isArray(rows)) return;
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    into.push({ ...row, _logSource: source });
  }
}

/** @returns {object[]} raw provider / providerLog rows from a turn payload or placeSearch blob */
export function extractProviderLogRows({ payload, placeSearch, itineraryJson } = {}) {
  const collected = [];
  const ps = placeSearch || payload?.placeSearch || itineraryJson?.placeSearch || itineraryJson?.search;
  pushRowsFromProviderArray(ps?.providerLog, 'placeSearch.providerLog', collected);
  pushRowsFromProviderArray(ps?.providers, 'placeSearch.providers', collected);
  pushRowsFromProviderArray(ps?.providerCallLog, 'placeSearch.providerCallLog', collected);
  pushRowsFromProviderArray(itineraryJson?.providerLog, 'itinerary.providerLog', collected);
  pushRowsFromProviderArray(itineraryJson?.providers, 'itinerary.providers', collected);

  const intake = payload?.intakeLodgingLookup || payload?.liveTranscript?.intakeLodgingLookup;
  if (Array.isArray(intake)) {
    for (const item of intake) {
      pushRowsFromProviderArray(item?.providers, 'intakeLodgingLookup.providers', collected);
      pushRowsFromProviderArray(item?.providerLog, 'intakeLodgingLookup.providerLog', collected);
    }
  }
  return collected;
}

export function isProviderHttp429(row = {}) {
  if (Number(row.httpStatus) === 429) return true;
  const reason = String(row.reason || row.message || '');
  return /\bHTTP\s*429\b/i.test(reason) || /\bnominatim:[^\n]*429/i.test(reason)
    || /\bstatus\s*429\b/i.test(reason) || /\b429\b/.test(reason);
}

function normalizeProviderCallRecord(checkName, row = {}) {
  return {
    check: checkName,
    provider: String(row.provider || '').trim() || null,
    status: row.status ?? null,
    httpStatus: Number.isFinite(Number(row.httpStatus)) ? Number(row.httpStatus) : null,
    calledAtMs: providerCallTimestampMs(row),
    reason: row.reason ? String(row.reason).slice(0, 800) : null,
    logSource: row._logSource || null,
  };
}

export function recordProviderCallsForCheck(out, checkName, sources = {}) {
  out.providerCallTimestamps = out.providerCallTimestamps || [];
  const rows = extractProviderLogRows(sources);
  const records = rows.map((row) => normalizeProviderCallRecord(checkName, row));
  out.providerCallTimestamps.push(...records);
  return records;
}

function provider429Violations(records = []) {
  return records.filter(isProviderHttp429);
}

export function formatProvider429HarnessMessage(violations = []) {
  return violations.map((row) => {
    const bits = [row.check, row.provider, row.reason || 'HTTP 429'].filter(Boolean);
    return bits.join(': ');
  }).join(' | ');
}

/**
 * Append provider call timestamps for a check; return a runCheck result when any row is HTTP 429.
 * @returns {null | { pass: false, harnessError: true, harnessMessage: string, http?: number }}
 */
export function attachProviderLogAndMaybeFail(out, checkName, sources = {}, { http } = {}) {
  const records = recordProviderCallsForCheck(out, checkName, sources);
  const hits = provider429Violations(records);
  if (!hits.length) return null;
  const message = `PROVIDER HTTP 429: ${formatProvider429HarnessMessage(hits)}`;
  out.provider429Failures = out.provider429Failures || [];
  out.provider429Failures.push({ check: checkName, message, hits });
  return {
    pass: false,
    harnessError: true,
    harnessMessage: message,
    ...(http != null ? { http } : {}),
  };
}

export function nominatimCallsPerSecondMax(calls = []) {
  const buckets = new Map();
  for (const row of calls) {
    if (String(row.provider || '').toLowerCase() !== 'nominatim') continue;
    const ms = providerCallTimestampMs(row);
    if (ms == null) continue;
    const sec = Math.floor(ms / 1000);
    buckets.set(sec, (buckets.get(sec) || 0) + 1);
  }
  let max = 0;
  for (const count of buckets.values()) max = Math.max(max, count);
  return buckets.size ? max : null;
}

export function finalizeSmokeProviderLogSummary(out) {
  const calls = out.providerCallTimestamps || [];
  out.nominatimCallsPerSecondMax = nominatimCallsPerSecondMax(calls);
}
