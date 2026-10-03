import { receiptKey, validateReceiptForActivation, sessionKey } from '../src/onboarding/eula-persistent-core.mjs';

let blobListCallCount = 0;

/** Harness-only counter: EULA readback must never invoke Blob list(). */
export function recordHarnessBlobListCall() {
  blobListCallCount += 1;
}

export function resetHarnessBlobListCallCount() {
  blobListCallCount = 0;
}

export function harnessBlobListCallCount() {
  return blobListCallCount;
}

function eulaStorePrefix(env = process.env) {
  return String(env.TIMESYNCHER_EULA_BLOB_PREFIX || 'timesyncher-eula').replace(/^\/+|\/+$/g, '');
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
  const receiptDoc = await readEulaReceiptDocument(db, sessionId, env);
  const sessionDoc = await readEulaSessionDocument(db, sessionId, env);
  const validation = receiptDoc
    ? validateReceiptForActivation({ session: sessionDoc, receipt: receiptDoc, requiredEulaVersion })
    : { ok: false, errors: ['receipt missing in eula_store_objects'] };
  const blobListCalls = harnessBlobListCallCount();
  return {
    sessionId,
    receiptKey: eulaStoreObjectKey(sessionId, 'receipt', env),
    receiptSha256: receiptDoc?.receiptSha256 || null,
    validation,
    blobListCalls,
    pass: validation.ok && blobListCalls === 0,
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
