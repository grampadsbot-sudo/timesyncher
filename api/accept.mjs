import { createPersistentStoreFromEnv } from '../src/onboarding/eula-persistent-store.mjs';
import { loadSessionPersistent } from '../src/onboarding/eula-persistent-core.mjs';
import { renderAcceptPage } from '../src/onboarding/eula-accept-page-render.mjs';

function send(res, status, body, type = 'text/html') {
  res.statusCode = status;
  res.setHeader('content-type', `${type}; charset=utf-8`);
  res.setHeader('cache-control', 'no-store');
  res.end(body);
}

export default async function handler(req, res) {
  const url = new URL(req.url || '/', 'https://timesyncher.com');
  const sessionId = url.searchParams.get('sessionId');
  if (req.method !== 'GET') return send(res, 405, 'Method not allowed', 'text/plain');
  if (!sessionId) return send(res, 400, 'Missing sessionId', 'text/plain');
  try {
    const store = createPersistentStoreFromEnv(process.env);
    const session = await loadSessionPersistent(store, sessionId);
    if (!session || session.unavailableReason) return send(res, 404, 'Acceptance session not found or unavailable', 'text/plain');
    return send(res, 200, renderAcceptPage(session));
  } catch (error) {
    return send(res, 400, error.message, 'text/plain');
  }
}
