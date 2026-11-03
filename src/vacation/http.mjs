export function sendJson(res, status, body, options = {}) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  if (!res.getHeader || !res.getHeader('cache-control')) {
    res.setHeader('cache-control', 'no-store');
  }
  const pretty = options.pretty === true;
  const serialized = pretty ? `${JSON.stringify(body, null, 2)}\n` : JSON.stringify(body);
  res.end(serialized);
}

export const SHARED_TRIP_JSON_CACHE_CONTROL = 'public, max-age=60, s-maxage=300, stale-while-revalidate=600';

export function sendSharedTripJson(res, status, body) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', SHARED_TRIP_JSON_CACHE_CONTROL);
  res.end(JSON.stringify(body));
}

export async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    const error = new Error('Request body must be valid JSON.');
    error.statusCode = 400;
    throw error;
  }
}

export function cleanText(value, max = 1000) {
  return String(value || '').trim().slice(0, max);
}

export function vacationAppErrorBody({ error, code, customerMessage } = {}) {
  const message = cleanText(customerMessage, 280);
  return {
    ok: false,
    error: cleanText(error, 500) || 'Request failed.',
    code: cleanText(code, 80) || undefined,
    customerMessage: message || 'We could not complete that. Please try again.',
  };
}

export function headerValue(req, name) {
  const value = req.headers[name.toLowerCase()] || req.headers[name];
  return Array.isArray(value) ? value[0] : value;
}
