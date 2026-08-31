#!/usr/bin/env node

import { spawn } from 'node:child_process';
import fs from 'node:fs';

const API_BASE = (process.env.TIMESYNCHER_API_BASE_URL || 'https://vacation.timesyncher.com').replace(/\/+$/, '');
const WORKER_ID = process.env.TIMESYNCHER_WORKER_ID || 'TimeStopper';
const WORKER_TOKEN = process.env.TIMESYNCHER_WORKER_TOKEN || '';
const TELEGRAM_BOT_TOKEN = process.env.TIMESYNCHER_TELEGRAM_BOT_TOKEN || process.env.TIMESYNCHER_VACATION_TELEGRAM_BOT_TOKEN || '';
const POLL_INTERVAL_MS = Number.parseInt(process.env.TIMESYNCHER_WORKER_POLL_MS || '15000', 10);
const PRODUCT_GBRAIN_DISPATCH = process.env.TIMESYNCHER_PRODUCT_GBRAIN_DISPATCH || '';
const ONCE = process.argv.includes('--once');
const DRAIN = process.argv.includes('--drain');
const DRAIN_ALL = process.argv.includes('--drain-all');
const DRAIN_MAX_JOBS = DRAIN_ALL ? 0 : Math.max(1, Number.parseInt(process.env.TIMESYNCHER_WORKER_DRAIN_MAX_JOBS || '1', 10));
const TARGET_JOB_ID = cleanText(process.env.TIMESYNCHER_WORKER_TARGET_JOB_ID, 80);
const TARGET_JOB_FILE = process.env.TIMESYNCHER_WORKER_TARGET_FILE || process.env.TIMESYNCHER_WORKER_DRAIN_TARGET_FILE || './telegram-worker-drain-target.json';

function requireEnv() {
  if (!WORKER_TOKEN) throw new Error('TIMESYNCHER_WORKER_TOKEN is required.');
}

function cleanText(value, max = 12000) {
  return String(value || '').trim().slice(0, max);
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

function readTargetJobId() {
  if (TARGET_JOB_ID) return TARGET_JOB_ID;
  try {
    const raw = JSON.parse(fs.readFileSync(TARGET_JOB_FILE, 'utf8'));
    return cleanText(raw.jobId || raw.job_id, 80);
  } catch {
    return '';
  }
}

function clearTargetJobFile() {
  if (!TARGET_JOB_ID) fs.rmSync(TARGET_JOB_FILE, { force: true });
}

async function claimJobs() {
  const targetJobId = readTargetJobId();
  const query = new URLSearchParams({ workerId: WORKER_ID, limit: '1' });
  if (targetJobId) query.set('jobId', targetJobId);
  const body = await api(`/api/worker-jobs?${query.toString()}`);
  if (targetJobId) clearTargetJobFile();
  return body.jobs || [];
}

function findSupportNoWriteDecision(value, depth = 0) {
  if (!value || typeof value !== 'object' || depth > 8) return null;
  const candidate = value.supportRouterDecision || value.turnDecision || value.routerDecision;
  if (candidate && typeof candidate === 'object') {
    const writeMode = String(candidate.write_mode || candidate.writeMode || '').toLowerCase();
    if (candidate.shouldQueueWorker === false || writeMode === 'none') return candidate;
  }
  for (const nested of Object.values(value)) {
    const found = findSupportNoWriteDecision(nested, depth + 1);
    if (found) return found;
  }
  return null;
}

async function handleJob(job) {
  const supportNoWrite = findSupportNoWriteDecision(job);
  if (supportNoWrite) {
    return {
      customerResponse: '',
      result: {
        handledBy: WORKER_ID,
        requestId: job.request_id,
        jobId: job.id,
        skipped: true,
        skipReason: 'support_router_no_write',
        supportRouterDecision: supportNoWrite,
      },
      toolingUsed: ['timestopper-worker-support-no-write-gate'],
    };
  }
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
    const child = spawn(process.execPath, [PRODUCT_GBRAIN_DISPATCH], {
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
  const targetChatId = cleanText(process.env.TIMESYNCHER_WORKER_TARGET_TELEGRAM_CHAT_ID, 120);
  if (targetChatId) return targetChatId;
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

function customerFailureMessage(error) {
  const raw = String(error?.message || error || '').trim();
  if (raw.includes('Concrete itinerary edit requests are not yet wired')) {
    return [
      'I received that, but I could not safely apply the itinerary edits automatically yet.',
      '',
      'I am not going to send the same unchanged vacation link and pretend it worked. The edit needs the deterministic trip mutator to run first.',
    ].join('\n');
  }
  if (raw.includes('No target TREK trip/share token could be identified') || raw.includes('No target shared trip token could be identified')) {
    return [
      'I received that, but I need to know which vacation to update before I change anything.',
      '',
      'Send the vacation website link or the trip name, or say that this is a brand-new vacation.',
    ].join('\n');
  }
  return [
    'I hit a technical issue while updating the vacation.',
    '',
    'I saved your message and will retry it. You can keep sending details here.',
  ].join('\n');
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
    return 0;
  }

  for (const job of jobs) {
    try {
      console.log(`[${new Date().toISOString()}] ${WORKER_ID}: claimed ${job.id} (${job.job_type})`);
      const completion = await handleJob(job);
      if (!cleanText(completion.customerResponse, 4000) && !completion.result?.skipped) {
        throw new Error('Worker completed without a customer response; saved turn requires retry or operator repair.');
      }
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
      const chatId = findTelegramChatId(job);
      if (chatId) {
        await sendTelegram(chatId, customerFailureMessage(error));
        console.log(`[${new Date().toISOString()}] ${WORKER_ID}: sent Telegram failure response for ${job.id}`);
      }
    }
  }
  return jobs.length;
}

async function main() {
  requireEnv();
  if (ONCE) {
    await tick();
    return;
  }
  if (DRAIN) {
    let processed = 0;
    for (;;) {
      const count = await tick();
      if (!count) return;
      processed += count;
      if (DRAIN_MAX_JOBS && processed >= DRAIN_MAX_JOBS) return;
    }
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
