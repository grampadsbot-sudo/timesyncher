import { randomUUID, timingSafeEqual } from 'node:crypto';
import { LocalJsonStore, VercelBlobStore } from '../onboarding/eula-persistent-store.mjs';
import { headerValue, readJson, sendJson } from '../vacation/http.mjs';

const STATE_KEY = 'state.json';
const PENDING_KEY = 'pending-command.json';
const ACTION_RESTART_GATEWAY = 'restart-gateway';

function controlStore(env = process.env) {
  if (env.OPENCLAW_CONTROL_STORE === 'local') {
    return new LocalJsonStore(env.OPENCLAW_CONTROL_STORE_DIR || 'runtime/openclaw-control');
  }
  return new VercelBlobStore({ prefix: env.OPENCLAW_CONTROL_BLOB_PREFIX || 'timesyncher-openclaw-control' });
}

function nowIso() {
  return new Date().toISOString();
}

function tokenFrom(req, headerName) {
  const auth = headerValue(req, 'authorization') || '';
  if (auth.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim();
  return headerValue(req, headerName) || '';
}

function equalToken(candidate, expected) {
  if (!candidate || !expected) return false;
  const left = Buffer.from(String(candidate));
  const right = Buffer.from(String(expected));
  return left.length === right.length && timingSafeEqual(left, right);
}

function requireAdmin(req) {
  if (!equalToken(tokenFrom(req, 'x-openclaw-admin-token'), process.env.OPENCLAW_ADMIN_TOKEN)) {
    const error = new Error('Unauthorized.');
    error.statusCode = 401;
    throw error;
  }
}

function requireAgent(req) {
  const expected = process.env.OPENCLAW_AGENT_TOKEN || process.env.OPENCLAW_ADMIN_TOKEN;
  if (!equalToken(tokenFrom(req, 'x-openclaw-agent-token'), expected)) {
    const error = new Error('Unauthorized.');
    error.statusCode = 401;
    throw error;
  }
}

function publicState(state, pending) {
  return {
    enabled: state.enabled !== false,
    lastAgentHeartbeatAt: state.lastAgentHeartbeatAt || null,
    lastPollAt: state.lastPollAt || null,
    lastRestartRequestedAt: state.lastRestartRequestedAt || null,
    lastRestartCompletedAt: state.lastRestartCompletedAt || null,
    lastRestartStatus: state.lastRestartStatus || null,
    lastRestartExitCode: state.lastRestartExitCode ?? null,
    lastRestartSummary: state.lastRestartSummary || '',
    pendingCommand: pending?.status === 'pending' || pending?.status === 'in-progress'
      ? {
          id: pending.id,
          action: pending.action,
          status: pending.status,
          requestedAt: pending.requestedAt,
          startedAt: pending.startedAt || null,
        }
      : null,
    audit: Array.isArray(state.audit) ? state.audit.slice(-12).reverse() : [],
  };
}

async function readState(store) {
  return (await store.getJson(STATE_KEY)) || { enabled: true, audit: [] };
}

async function readPending(store) {
  const pending = await store.getJson(PENDING_KEY);
  return pending?.action ? pending : null;
}

async function writeState(store, state, event) {
  const audit = Array.isArray(state.audit) ? state.audit : [];
  const next = {
    ...state,
    audit: event ? [...audit, { at: nowIso(), ...event }].slice(-50) : audit.slice(-50),
  };
  await store.putJson(STATE_KEY, next);
  return next;
}

function summarize(text) {
  return String(text || '').replace(/\s+/g, ' ').trim().slice(0, 800);
}

export async function handleOpenClawControl(req, res, controlAction) {
  const store = controlStore();

  try {
    if (req.method === 'GET' && controlAction === 'status') {
      requireAdmin(req);
      const [state, pending] = await Promise.all([readState(store), readPending(store)]);
      return sendJson(res, 200, { ok: true, control: publicState(state, pending) });
    }

    if (req.method === 'POST' && controlAction === 'request-restart') {
      requireAdmin(req);
      const body = await readJson(req);
      const state = await readState(store);
      const existing = await readPending(store);
      if ((existing?.status === 'pending' || existing?.status === 'in-progress') && !body.force) {
        return sendJson(res, 409, { ok: false, error: 'Restart already pending.', command: existing });
      }
      const command = {
        id: randomUUID(),
        action: ACTION_RESTART_GATEWAY,
        status: 'pending',
        requestedAt: nowIso(),
        requestedBy: summarize(body.requestedBy || 'admin-page'),
      };
      await store.putJson(PENDING_KEY, command);
      const nextState = await writeState(store, {
        ...state,
        enabled: true,
        lastRestartRequestedAt: command.requestedAt,
      }, { type: 'restart_requested', commandId: command.id });
      return sendJson(res, 202, { ok: true, command, control: publicState(nextState, command) });
    }

    if (req.method === 'POST' && controlAction === 'heartbeat') {
      requireAgent(req);
      const state = await readState(store);
      const nextState = await writeState(store, {
        ...state,
        enabled: true,
        lastAgentHeartbeatAt: nowIso(),
      });
      return sendJson(res, 200, { ok: true, control: publicState(nextState, await readPending(store)) });
    }

    if (req.method === 'GET' && controlAction === 'poll') {
      requireAgent(req);
      const state = await readState(store);
      const pending = await readPending(store);
      const nextState = await writeState(store, {
        ...state,
        enabled: true,
        lastAgentHeartbeatAt: nowIso(),
        lastPollAt: nowIso(),
      });
      if (!pending || pending.status !== 'pending') {
        return sendJson(res, 200, { ok: true, command: null, control: publicState(nextState, pending) });
      }
      const inProgress = { ...pending, status: 'in-progress', startedAt: nowIso() };
      await store.putJson(PENDING_KEY, inProgress);
      return sendJson(res, 200, { ok: true, command: { id: inProgress.id, action: inProgress.action } });
    }

    if (req.method === 'POST' && controlAction === 'complete') {
      requireAgent(req);
      const body = await readJson(req);
      const pending = await readPending(store);
      if (!pending || pending.id !== body.commandId) {
        return sendJson(res, 409, { ok: false, error: 'Command is not current.' });
      }
      const completedAt = nowIso();
      const completed = {
        ...pending,
        status: body.status === 'ok' ? 'completed' : 'failed',
        completedAt,
        exitCode: Number.isFinite(body.exitCode) ? body.exitCode : null,
        summary: summarize(body.summary || body.output || ''),
      };
      await store.putJson(PENDING_KEY, { status: 'none', updatedAt: completedAt });
      await store.putJson(`history/${completed.id}.json`, completed);
      const state = await readState(store);
      const nextState = await writeState(store, {
        ...state,
        lastAgentHeartbeatAt: completedAt,
        lastRestartCompletedAt: completedAt,
        lastRestartStatus: completed.status,
        lastRestartExitCode: completed.exitCode,
        lastRestartSummary: completed.summary,
      }, { type: 'restart_completed', commandId: completed.id, status: completed.status });
      return sendJson(res, 200, { ok: true, control: publicState(nextState, null) });
    }

    return sendJson(res, 404, { ok: false, error: 'unknown control action' });
  } catch (error) {
    return sendJson(res, error.statusCode || 400, { ok: false, error: error.message || 'Control request failed.' });
  }
}
