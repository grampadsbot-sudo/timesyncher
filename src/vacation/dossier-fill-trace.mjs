import { dossierPageFailure } from './dossier-page-integrity.mjs';

export function createDossierFillTrace() {
  return {
    gather: { path: 'fresh', gate: 'no_saved_dossier' }, attempts: [],
    pages: { raw: 0, normalized: 0 }, pagesVerified: false, firstFailingPage: null, pageRepairs: [],
    builder: { ran: false, structuredTextChars: 0, jsonParsed: null, summaryClaims: 0,
      descriptionClaims: 0, judgeSupported: 0, judgeUnsupported: 0, blankedBy: null, attempts: [] },
  };
}

const traceAttempts = new WeakMap();

function safeQuery(value) {
  return String(value || '').replace(/https?:\/\/[^\s]+/gi, (raw) => {
    try { const url = new URL(raw); return `${url.origin}${url.pathname}`; } catch { return '[url]'; }
  }).replace(/\bBearer\s+\S+/gi, '[redacted]')
    .replace(/\b(?:api[_-]?key|token|secret|authorization)\s*[:=]\s*[^\s]+/gi, '[redacted]').slice(0, 120);
}

export function recordDossierTraceAttempts(trace, attempts = []) {
  if (!trace) return;
  for (const row of attempts) {
    if (!['brave', 'page'].includes(row.kind)) continue;
    if (!traceAttempts.has(trace)) traceAttempts.set(trace, new Set());
    const seen = traceAttempts.get(trace);
    const identity = JSON.stringify(row);
    if (seen.has(identity)) continue;
    seen.add(identity);
    const provider = row.kind === 'brave' || /brave/i.test(row.provider || row.via || '')
      ? 'Brave' : /tavily/i.test(row.provider || row.via || '') ? 'Tavily' : 'direct';
    const httpStatus = Number(row.httpStatus) || Number(String(row.error || '').match(/(?:http[_ ]|HTTP\s+)(\d{3})/i)?.[1]) || null;
    trace.attempts.push({ provider, stage: row.stage || row.step || row.method || 'gather',
      query: safeQuery(row.query), status: row.status || 'unknown', httpStatus,
      results: Number(row.results ?? row.pages ?? (row.kind === 'page' && row.status === 'ok' ? 1 : 0)) || 0 });
  }
}

export function recordDossierTracePages(trace, raw = {}, normalized = raw) {
  if (!trace) return;
  trace.pages = { raw: Math.max(trace.pages.raw, raw.pages?.length || 0), normalized: normalized.pages?.length || 0 };
  const index = (raw.pages || []).findIndex((page) => dossierPageFailure(page));
  if (index >= 0) trace.firstFailingPage ||= { index, reason: dossierPageFailure(raw.pages[index]) };
  if (trace.pages.raw && !normalized.pages?.length) trace.builder.blankedBy = 'unverified_pages';
  trace.pagesVerified = Boolean(normalized.pages?.length && normalized.pages.every((page) => !dossierPageFailure(page)));
}
