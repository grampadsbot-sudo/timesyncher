import { fork } from 'node:child_process';
import { braveSubscriptionKey, tavilyApiKey } from './poi-search.mjs';
import { BRAVE_PROVIDER_KEY_NAME, TAVILI_PROVIDER_KEY_NAME } from './provider-env.mjs';

export function runDossierFetchTask(operation, place, options = {}, {
  workerUrl = new URL('./dossier-fetch-worker.mjs', import.meta.url),
  timeoutMs = 45000,
} = {}) {
  const budget = Math.min(timeoutMs, options.deadline ? options.deadline - Date.now() : timeoutMs);
  let latest = structuredClone(options.dossier || { pages: [], attempts: [] });
  return new Promise((resolve, reject) => {
    let child, timer, settled = false;
    const finish = (error, dossier) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (child) child.kill('SIGKILL');
      if (error) reject(error);
      else resolve(dossier);
    };
    const failed = (code, detail = {}) => {
      const dossier = { ...latest, attempts: [...(latest.attempts || []), {
        kind: 'fetch_worker', step: operation, status: 'failed', error: code,
        startedAt: new Date().toISOString(), workerPid: child?.pid, ...detail,
      }] };
      if (!dossier.pages?.length) dossier.emptySource = code;
      finish(null, dossier);
    };
    if (budget <= 0) { failed('fetch_worker_timeout'); return; }
    try {
      child = fork(workerUrl, [], { env: {}, execArgv: [], stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
      timer = setTimeout(() => failed('fetch_worker_timeout'), budget);
      child.on('error', () => failed('fetch_worker_start_failed'));
      child.on('exit', (exitCode, signal) => failed('fetch_worker_exit', { exitCode, signal }));
      child.on('message', async (message) => {
        if (settled) return;
        try {
          if (message?.type === 'progress' && validDossier(message.dossier)) {
            latest = message.dossier;
            Object.assign(options.bravePace || {}, message.bravePace);
            if (options.onProgress) await options.onProgress(latest);
            if (!settled) child.send({ type: 'ack' }, (error) => {
              if (error) failed('fetch_worker_ipc_failed');
            });
          } else if (message?.type === 'result' && validDossier(message.dossier)) {
            Object.assign(options.bravePace || {}, message.bravePace);
            finish(null, message.dossier);
          } else {
            failed(message?.type === 'error' ? 'fetch_worker_task_failed' : 'fetch_worker_protocol');
          }
        } catch (error) { finish(error); }
      });
      const { destination, center, deadline, onlyFields, dossier, bravePace, botPrimary } = options;
      const env = options.env || process.env;
      child.send({ operation, place, options: {
        destination, center, deadline, onlyFields, dossier, bravePace, botPrimary,
        env: {
          [BRAVE_PROVIDER_KEY_NAME]: braveSubscriptionKey(options.env), [TAVILI_PROVIDER_KEY_NAME]: tavilyApiKey(options.env),
          VK_SEARCH_BOT_PRIMARY: env.VK_SEARCH_BOT_PRIMARY,
          VK_SEARCH_WAKE_URL: env.VK_SEARCH_WAKE_URL,
          VK_SEARCH_CENSUS_DIR: env.VK_SEARCH_CENSUS_DIR,
        },
      } }, (error) => { if (error) failed('fetch_worker_ipc_failed'); });
    } catch {
      failed('fetch_worker_start_failed');
    }
  });
}

function validDossier(value) {
  return value && Array.isArray(value.pages) && Array.isArray(value.attempts);
}
