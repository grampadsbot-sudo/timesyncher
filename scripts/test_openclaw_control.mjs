import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import handler from '../api/eula.mjs';

const adminToken = 'admin-test-token';
const agentToken = 'agent-test-token';
const root = mkdtempSync(join(tmpdir(), 'timesyncher-openclaw-control-'));

process.env.OPENCLAW_CONTROL_STORE = 'local';
process.env.OPENCLAW_CONTROL_STORE_DIR = root;
process.env.OPENCLAW_ADMIN_TOKEN = adminToken;
process.env.OPENCLAW_AGENT_TOKEN = agentToken;

const server = createServer((req, res) => handler(req, res));

function listen() {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
}

async function api(base, action, { token, method = 'GET', body, agent = false } = {}) {
  const response = await fetch(`${base}/api/eula?action=${encodeURIComponent(`openclaw-control-${action}`)}`, {
    method,
    headers: {
      'content-type': 'application/json',
      [agent ? 'x-openclaw-agent-token' : 'x-openclaw-admin-token']: token,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json();
  return { response, data };
}

function assert(value, message) {
  if (!value) throw new Error(message);
}

try {
  const port = await listen();
  const base = `http://127.0.0.1:${port}`;

  let result = await api(base, 'status', { token: 'wrong' });
  assert(result.response.status === 401, 'wrong admin token should be rejected');

  result = await api(base, 'request-restart', {
    token: adminToken,
    method: 'POST',
    body: { requestedBy: 'test' },
  });
  assert(result.response.status === 202, 'restart request should be accepted');
  const commandId = result.data.command.id;

  result = await api(base, 'poll', { token: agentToken, agent: true });
  assert(result.data.command?.id === commandId, 'agent should receive pending command');
  assert(result.data.command.action === 'restart-gateway', 'only restart-gateway command should be emitted');

  result = await api(base, 'complete', {
    token: agentToken,
    agent: true,
    method: 'POST',
    body: { commandId, status: 'ok', exitCode: 0, summary: 'test complete' },
  });
  assert(result.response.status === 200, 'completion should be accepted');
  assert(result.data.control.lastRestartStatus === 'completed', 'state should record completion');

  result = await api(base, 'status', { token: adminToken });
  assert(!result.data.control.pendingCommand, 'status should not expose completed command as pending');
  console.log('openclaw control smoke passed');
} finally {
  server.close();
  rmSync(root, { recursive: true, force: true });
}
