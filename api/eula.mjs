import { createPersistentStoreFromEnv } from '../src/onboarding/eula-persistent-store.mjs';
import {
  acceptEulaPersistent,
  activationStatusPersistent,
  createOnboardingSessionPersistent,
  loadDefaultEulaText,
  loadSessionPersistent,
  receiptKey,
} from '../src/onboarding/eula-persistent-core.mjs';
import { acceptanceNameForReceipt, renderAcceptPage } from '../src/onboarding/eula-accept-page-render.mjs';
import { handleOpenClawControl } from '../src/openclaw/control-handler.mjs';
import { sql } from '../src/vacation/db.mjs';
import { completePendingCollaboratorsForEulaSession } from '../src/vacation/collaborators.mjs';

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

function telegramBotUsername(env = process.env) {
  return String(env.TIMESYNCHER_VACATION_TELEGRAM_BOT_USERNAME
    || env.TIMESYNCHER_TELEGRAM_BOT_USERNAME
    || 'TimeSyncherVacationBot').trim().replace(/^@/, '');
}

function vacationContinueUrl(session, sessionId, env = process.env) {
  if (session?.google?.returnUrl) return String(session.google.returnUrl).replace(/\s+/g, '');
  if (!String(session?.clientKey || '').startsWith('vacation-onboarding:')) return null;
  const token = String(sessionId || '').startsWith('vacation-') ? String(sessionId).slice('vacation-'.length) : '';
  if (!token) return null;
  return `https://t.me/${telegramBotUsername(env)}?start=${encodeURIComponent(token)}`;
}

function telegramBotToken(env = process.env) {
  return env.TIMESYNCHER_TELEGRAM_BOT_TOKEN || env.TIMESYNCHER_VACATION_TELEGRAM_BOT_TOKEN || '';
}

async function sendTelegramWelcome(chatId, text, env = process.env) {
  const token = telegramBotToken(env);
  if (!token || !chatId || !text) return { ok: false, skipped: true };
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
    }),
  });
  const body = await response.json().catch(() => ({}));
  return { ok: response.ok && body?.ok !== false, status: response.status, body };
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
      const sessionId = url.searchParams.get('sessionId');
      const session = await loadSessionPersistent(store, sessionId);
      if (!session || session.unavailableReason) return send(res, 404, { ok: false, error: session?.unavailableReason || 'session not found' });
      const exposed = publicSession(session);
      if (exposed && !exposed.google?.returnUrl) {
        exposed.google = { ...(exposed.google || {}), returnUrl: vacationContinueUrl(session, sessionId, process.env) };
      }
      return send(res, 200, { ok: true, session: exposed });
    }
    if (req.method === 'GET' && action === 'accept-page') {
      const session = await loadSessionPersistent(store, url.searchParams.get('sessionId'));
      if (!session || session.unavailableReason) return send(res, 404, 'Acceptance session not found or unavailable', 'text/plain');
      return send(res, 200, renderAcceptPage({
        ...session,
        google: {
          ...(session.google || {}),
          returnUrl: vacationContinueUrl(session, url.searchParams.get('sessionId'), process.env),
        },
      }), 'text/html');
    }
    if (req.method === 'POST' && action === 'accept') {
      const body = await readBody(req);
      const sessionId = url.searchParams.get('sessionId');
      const session = await loadSessionPersistent(store, sessionId);
      const result = await acceptEulaPersistent(store, sessionId, {
        acceptedByName: String(body.acceptedByName || '').trim() || acceptanceNameForReceipt(session),
        checkboxConfirmed: body.checkboxConfirmed,
        ipAddress: req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '',
        userAgent: req.headers['user-agent'] || '',
      });
      let collaboratorActivations = [];
      if (sessionId?.startsWith('vacation-collaborator-')) {
        try {
          const db = sql(process.env);
          collaboratorActivations = await completePendingCollaboratorsForEulaSession(db, { sessionId, env: process.env });
          for (const activation of collaboratorActivations) {
            if (activation.ok && activation.telegramChatId) {
              await sendTelegramWelcome(activation.telegramChatId, activation.reply, process.env).catch(() => null);
            }
          }
        } catch (activationError) {
          collaboratorActivations = [{ ok: false, status: 'activation_error', error: activationError.message }];
        }
      }
      return send(res, 201, {
        ok: true,
        receiptSha256: result.receipt.receiptSha256,
        continueUrl: vacationContinueUrl(session, sessionId, process.env),
        collaboratorActivations: collaboratorActivations.map((activation) => ({
          ok: Boolean(activation.ok),
          status: activation.status || null,
          notifiedTelegram: Boolean(activation.ok && activation.telegramChatId),
          error: activation.error || null,
        })),
      });
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
