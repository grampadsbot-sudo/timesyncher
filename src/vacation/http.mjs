export function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(body, null, 2) + '\n');
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

export function headerValue(req, name) {
  const value = req.headers[name.toLowerCase()] || req.headers[name];
  return Array.isArray(value) ? value[0] : value;
}
