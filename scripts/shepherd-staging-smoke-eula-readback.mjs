import { receiptKey, validateReceiptForActivation, sessionKey } from '../src/onboarding/eula-persistent-core.mjs';

let blobListCallCount = 0;

export function resetHarnessBlobListCallCount() {
  blobListCallCount = 0;
}

export function harnessBlobListCallCount() {
  return blobListCallCount;
}

const EULA_BLOB_PREFIX_ENV = 'TIMESYNCHER_EULA_BLOB_PREFIX';

export function requireEulaStorePrefix(env = process.env) {
  const raw = String(env[EULA_BLOB_PREFIX_ENV] || '').trim();
  if (!raw) {
    throw new Error(`${EULA_BLOB_PREFIX_ENV} is required for EULA harness readback (no default prefix)`);
  }
  return raw.replace(/^\/+|\/+$/g, '');
}

function eulaStorePrefix(env = process.env) {
  return requireEulaStorePrefix(env);
}

export function eulaVacationSessionId(sessionToken) {
  return `vacation-${String(sessionToken || '').trim()}`;
}

export function eulaStoreObjectKey(sessionId, kind, env = process.env) {
  const prefix = eulaStorePrefix(env);
  const rel = kind === 'receipt' ? receiptKey(sessionId) : sessionKey(sessionId);
  return `${prefix}/${rel}`.replace(/\/+/g, '/');
}

/** Read receipt JSON from eula_store_objects (no Blob SDK, no store.listJson). */
export async function readEulaReceiptDocument(db, sessionId, env = process.env) {
  const key = eulaStoreObjectKey(sessionId, 'receipt', env);
  const rows = await db`select document from eula_store_objects where key = ${key} limit 1`;
  return rows[0]?.document ?? null;
}

export async function listEulaStoreObjectKeysForSession(db, sessionId, env = process.env) {
  const like = `%${String(sessionId || '').trim()}%`;
  const rows = await db`select key from eula_store_objects where key like ${like} order by key`;
  const keys = rows.map((row) => row.key);
  return { keys, rowCount: keys.length, sessionIdLike: like };
}

async function readEulaSessionDocument(db, sessionId, env = process.env) {
  const key = eulaStoreObjectKey(sessionId, 'session', env);
  const rows = await db`select document from eula_store_objects where key = ${key} limit 1`;
  return rows[0]?.document ?? null;
}

export async function runEulaReadbackGate({
  db,
  sessionToken,
  env = process.env,
  requiredEulaVersion = env.TIMESYNCHER_EULA_VERSION || '2026-06-terms-advisory-only',
}) {
  resetHarnessBlobListCallCount();
  const sessionId = eulaVacationSessionId(sessionToken);
  let prefixError = null;
  try {
    requireEulaStorePrefix(env);
  } catch (err) {
    prefixError = String(err?.message || err);
  }
  if (prefixError) {
    const storeKeys = await listEulaStoreObjectKeysForSession(db, sessionId, env).catch(() => ({
      keys: [],
      rowCount: 0,
      sessionIdLike: `%${sessionId}%`,
    }));
    return {
      sessionId,
      receiptKey: null,
      receiptSha256: null,
      validation: { ok: false, errors: [prefixError] },
      blobListCalls: 0,
      eulaStoreKeysForSession: storeKeys.keys,
      eulaStoreKeyRowCount: storeKeys.rowCount,
      pass: false,
      eulaStoreKeyDiag: {
        prefixError,
        sessionIdLike: storeKeys.sessionIdLike,
        keys: storeKeys.keys,
        rowCount: storeKeys.rowCount,
      },
    };
  }
  const receiptDoc = await readEulaReceiptDocument(db, sessionId, env);
  const sessionDoc = await readEulaSessionDocument(db, sessionId, env);
  const storeKeys = await listEulaStoreObjectKeysForSession(db, sessionId, env);
  const validation = receiptDoc
    ? validateReceiptForActivation({ session: sessionDoc, receipt: receiptDoc, requiredEulaVersion })
    : { ok: false, errors: ['receipt missing in eula_store_objects'] };
  const blobListCalls = harnessBlobListCallCount();
  const pass = validation.ok && blobListCalls === 0;
  return {
    sessionId,
    receiptKey: eulaStoreObjectKey(sessionId, 'receipt', env),
    receiptSha256: receiptDoc?.receiptSha256 || null,
    validation,
    blobListCalls,
    eulaStoreKeysForSession: storeKeys.keys,
    eulaStoreKeyRowCount: storeKeys.rowCount,
    pass,
    ...(pass ? {} : {
      eulaStoreKeyDiag: {
        expectedReceiptKey: eulaStoreObjectKey(sessionId, 'receipt', env),
        sessionIdLike: storeKeys.sessionIdLike,
        keys: storeKeys.keys,
        rowCount: storeKeys.rowCount,
      },
    }),
  };
}

export async function registerShepherdEulaReadbackCheck(runCheck, { db, out, sessionToken }) {
  await runCheck('EULA', async ({ setStage }) => {
    setStage('eula receipt readback');
    const readback = await runEulaReadbackGate({ db, sessionToken, env: process.env });
    out.checkEULA = readback;
    const pass = readback.pass === true;
    return { pass, http: pass ? 200 : 500 };
  }, { timeoutMs: 60000 });
}
