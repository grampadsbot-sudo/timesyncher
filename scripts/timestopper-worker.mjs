#!/usr/bin/env node

import { spawn } from 'node:child_process';

const API_BASE = (process.env.TIMESYNCHER_API_BASE_URL || 'https://vacation.timesyncher.com').replace(/\/+$/, '');
const WORKER_ID = process.env.TIMESYNCHER_WORKER_ID || 'TimeStopper';
const WORKER_TOKEN = process.env.TIMESYNCHER_WORKER_TOKEN || '';
const TELEGRAM_BOT_TOKEN = process.env.TIMESYNCHER_TELEGRAM_BOT_TOKEN || process.env.TIMESYNCHER_VACATION_TELEGRAM_BOT_TOKEN || '';
const POLL_INTERVAL_MS = Number.parseInt(process.env.TIMESYNCHER_WORKER_POLL_MS || '15000', 10);
const PRODUCT_GBRAIN_DISPATCH = process.env.TIMESYNCHER_PRODUCT_GBRAIN_DISPATCH || '';
const ONCE = process.argv.includes('--once');

function requireEnv() {
  if (!WORKER_TOKEN) throw new Error('TIMESYNCHER_WORKER_TOKEN is required.');
}

async function api(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      authorization: `Bearer ${WORKER_TOKEN}`,
      'content-type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.ok === false) {
    throw new Error(body.error || `HTTP ${response.status}`);
  }
  return body;
}

async function claimJobs() {
  const query = new URLSearchParams({ workerId: WORKER_ID, limit: '1' });
  const body = await api(`/api/worker-jobs?${query.toString()}`);
  return body.jobs || [];
}

async function handleJob(job) {
  if (PRODUCT_GBRAIN_DISPATCH) {
    return dispatchProductGbrain(job);
  }
  return {
    customerResponse: 'Your TimeSyncher Vacation request was received and is queued for planning.',
    result: {
      handledBy: WORKER_ID,
      requestId: job.request_id,
      jobId: job.id,
      requestType: job.request_type || job.job_type,
      nextStep: 'dispatch_to_product_gbrain',
    },
    toolingUsed: ['timestopper-worker-scaffold'],
  };
}

function dispatchProductGbrain(job) {
  return new Promise((resolve, reject) => {
    const child = spawn(PRODUCT_GBRAIN_DISPATCH, [], {
      env: process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `Product GBrain dispatch exited ${code}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch (error) {
        reject(new Error(`Product GBrain dispatch returned invalid JSON: ${error.message}`));
      }
    });
    child.stdin.end(JSON.stringify({ job }));
  });
}

async function completeJob(job, completion) {
  return api('/api/worker-jobs', {
    method: 'POST',
    body: JSON.stringify({
      jobId: job.id,
      workerId: WORKER_ID,
      status: 'completed',
      customerResponse: completion.customerResponse,
      result: completion.result,
      toolingUsed: completion.toolingUsed,
    }),
  });
}

function findTelegramChatId(value) {
  if (!value || typeof value !== 'object') return '';
  const direct = value.telegramChatId || value.telegram_chat_id;
  if (direct) return String(direct);
  for (const key of ['payload', 'input', 'message']) {
    const nested = findTelegramChatId(value[key]);
    if (nested) return nested;
  }
  if (Array.isArray(value.trip_transcript)) {
    for (const turn of value.trip_transcript) {
      const nested = findTelegramChatId(turn);
      if (nested) return nested;
    }
  }
  return '';
}

async function sendTelegram(chatId, text) {
  if (!TELEGRAM_BOT_TOKEN || !chatId || !text) return false;
  const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: String(text).slice(0, 3900),
      disable_web_page_preview: true,
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.ok === false) {
    throw new Error(body.description || `Telegram sendMessage HTTP ${response.status}`);
  }
  return true;
}

async function retryJob(job, error) {
  return api('/api/worker-jobs', {
    method: 'POST',
    body: JSON.stringify({
      jobId: job.id,
      workerId: WORKER_ID,
      status: 'retry',
      errorSummary: error.message || String(error),
      result: { failedAt: new Date().toISOString() },
      toolingUsed: ['timestopper-worker-scaffold'],
    }),
  });
}

async function tick() {
  const jobs = await claimJobs();
  if (!jobs.length) {
    console.log(`[${new Date().toISOString()}] ${WORKER_ID}: no jobs`);
    return;
  }

  for (const job of jobs) {
    try {
      console.log(`[${new Date().toISOString()}] ${WORKER_ID}: claimed ${job.id} (${job.job_type})`);
      const completion = await handleJob(job);
      await completeJob(job, completion);
      const chatId = findTelegramChatId(job);
      if (chatId && completion.customerResponse) {
        await sendTelegram(chatId, completion.customerResponse);
        console.log(`[${new Date().toISOString()}] ${WORKER_ID}: sent Telegram response for ${job.id}`);
      }
      console.log(`[${new Date().toISOString()}] ${WORKER_ID}: completed ${job.id}`);
    } catch (error) {
      console.error(`[${new Date().toISOString()}] ${WORKER_ID}: failed ${job.id}: ${error.message}`);
      await retryJob(job, error);
    }
  }
}

async function main() {
  requireEnv();
  if (ONCE) {
    await tick();
    return;
  }
  for (;;) {
    await tick().catch((error) => {
      console.error(`[${new Date().toISOString()}] ${WORKER_ID}: poll failed: ${error.message}`);
    });
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
