import { createPersistentStoreFromEnv } from '../src/onboarding/eula-persistent-store.mjs';
import {
  acceptEulaPersistent,
  activationStatusPersistent,
  createOnboardingSessionPersistent,
  loadDefaultEulaText,
  loadSessionPersistent,
  receiptKey,
} from '../src/onboarding/eula-persistent-core.mjs';
import { renderAcceptPage } from '../src/onboarding/eula-accept-page-render.mjs';
import { handleOpenClawControl } from '../src/openclaw/control-handler.mjs';

const DEFAULT_EULA_VERSION = process.env.TIMESYNCHER_EULA_VERSION || '2026-06-terms-advisory-only';

function send(res, status, body, type = 'application/json') {
  res.statusCode = status;
  res.setHeader('content-type', `${type}; charset=utf-8`);
  res.setHeader('cache-control', 'no-store');
  res.end(typeof body === 'string' ? body : JSON.stringify(body, null, 2) + '\n');
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

function publicSession(session) {
  if (!session) return null;
  const { eula, ...rest } = session;
  return { ...rest, eula: { version: eula.version, text: eula.text } };
}

export default async function handler(req, res) {
  const store = createPersistentStoreFromEnv(process.env);
  const url = new URL(req.url || '/', 'https://timesyncher.com');
  const action = url.searchParams.get('action');
  try {
    if (action?.startsWith('openclaw-control-')) {
      return await handleOpenClawControl(req, res, action.slice('openclaw-control-'.length));
    }
    if (req.method === 'POST' && action === 'create-session') {
      const body = await readBody(req);
      const eulaText = body.eula?.text || loadDefaultEulaText();
      const session = await createOnboardingSessionPersistent(store, {
        ...body,
        eula: { version: body.eula?.version || DEFAULT_EULA_VERSION, text: eulaText },
      });
      return send(res, 201, { ok: true, sessionId: session.sessionId, session: publicSession(session) });
    }
    if (req.method === 'GET' && action === 'get-session') {
      const session = await loadSessionPersistent(store, url.searchParams.get('sessionId'));
      if (!session || session.unavailableReason) return send(res, 404, { ok: false, error: session?.unavailableReason || 'session not found' });
      return send(res, 200, { ok: true, session: publicSession(session) });
    }
    if (req.method === 'GET' && action === 'accept-page') {
      const session = await loadSessionPersistent(store, url.searchParams.get('sessionId'));
      if (!session || session.unavailableReason) return send(res, 404, 'Acceptance session not found or unavailable', 'text/plain');
      return send(res, 200, renderAcceptPage(session), 'text/html');
    }
    if (req.method === 'POST' && action === 'accept') {
      const body = await readBody(req);
      const result = await acceptEulaPersistent(store, url.searchParams.get('sessionId'), {
        acceptedByName: body.acceptedByName,
        checkboxConfirmed: body.checkboxConfirmed,
        ipAddress: req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '',
        userAgent: req.headers['user-agent'] || '',
      });
      return send(res, 201, { ok: true, receiptSha256: result.receipt.receiptSha256 });
    }
    if (req.method === 'GET' && action === 'receipt') {
      const receipt = await store.getJson(receiptKey(url.searchParams.get('sessionId')));
      if (!receipt) return send(res, 404, { ok: false, error: 'receipt not found' });
      return send(res, 200, { ok: true, receipt });
    }
    if (req.method === 'GET' && action === 'activation-status') {
      const status = await activationStatusPersistent(store, url.searchParams.get('clientKey'), url.searchParams.get('eulaVersion') || DEFAULT_EULA_VERSION);
      return send(res, 200, status);
    }
    return send(res, 404, { ok: false, error: 'unknown action' });
  } catch (error) {
    return send(res, 400, { ok: false, error: error.message });
  }
}
