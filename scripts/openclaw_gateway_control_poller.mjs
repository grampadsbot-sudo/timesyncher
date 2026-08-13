#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { execFile } from 'node:child_process';

const endpoint = process.env.OPENCLAW_CONTROL_URL || 'https://www.timesyncher.com/api/eula';
const token = process.env.OPENCLAW_AGENT_TOKEN || process.env.OPENCLAW_ADMIN_TOKEN || '';
const statePath = process.env.OPENCLAW_CONTROL_LOCAL_STATE || join(homedir(), '.openclaw', 'openclaw-control-state.json');

function log(message) {
  process.stdout.write(`[${new Date().toISOString()}] ${message}\n`);
}

function loadLocalState() {
  if (!existsSync(statePath)) return {};
  try {
    return JSON.parse(readFileSync(statePath, 'utf8'));
  } catch {
    return {};
  }
}

function saveLocalState(state) {
  mkdirSync(dirname(statePath), { recursive: true });
  writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n');
}

async function api(action, { method = 'GET', body } = {}) {
  if (!token) throw new Error('OPENCLAW_AGENT_TOKEN is required.');
  const response = await fetch(`${endpoint}?action=${encodeURIComponent(`openclaw-control-${action}`)}`, {
    method,
    headers: {
      'content-type': 'application/json',
      'x-openclaw-agent-token': token,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok) throw new Error(data.error || `API ${action} failed with ${response.status}`);
  return data;
}

function openclawBinary() {
  for (const path of ['/opt/homebrew/bin/openclaw', '/usr/local/bin/openclaw']) {
    if (existsSync(path)) return path;
  }
  return 'openclaw';
}

function restartGateway() {
  return new Promise((resolve) => {
    const child = execFile(openclawBinary(), ['gateway', 'restart'], {
      timeout: 180000,
      maxBuffer: 1024 * 1024,
      env: { ...process.env, PATH: `/opt/homebrew/bin:/usr/local/bin:${process.env.PATH || ''}` },
    }, (error, stdout, stderr) => {
      resolve({
        ok: !error,
        exitCode: typeof error?.code === 'number' ? error.code : 0,
        output: `${stdout || ''}\n${stderr || ''}`.trim(),
      });
    });
  });
}

async function main() {
  await api('heartbeat', { method: 'POST' });
  const poll = await api('poll');
  if (!poll.command) {
    log('No command pending.');
    return;
  }
  if (poll.command.action !== 'restart-gateway') {
    throw new Error(`Unsupported command: ${poll.command.action}`);
  }

  const localState = loadLocalState();
  if (localState.lastCommandId === poll.command.id) {
    log(`Command ${poll.command.id} already handled locally; reporting duplicate completion.`);
    await api('complete', {
      method: 'POST',
      body: {
        commandId: poll.command.id,
        status: 'error',
        exitCode: 0,
        summary: 'Duplicate command id already handled locally; skipped.',
      },
    });
    return;
  }

  log(`Running openclaw gateway restart for command ${poll.command.id}.`);
  saveLocalState({ ...localState, lastCommandId: poll.command.id, lastCommandStartedAt: new Date().toISOString() });
  const result = await restartGateway();
  await api('complete', {
    method: 'POST',
    body: {
      commandId: poll.command.id,
      status: result.ok ? 'ok' : 'error',
      exitCode: result.exitCode,
      summary: result.output,
    },
  });
  saveLocalState({
    ...loadLocalState(),
    lastCommandId: poll.command.id,
    lastCommandCompletedAt: new Date().toISOString(),
    lastCommandOk: result.ok,
  });
  log(result.ok ? 'Restart completed.' : 'Restart failed.');
}

main().catch(async (error) => {
  log(`Error: ${error.message}`);
  process.exitCode = 1;
});
