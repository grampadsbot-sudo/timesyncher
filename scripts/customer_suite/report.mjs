import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { STAGING } from './staging.mjs';

export const REPO = 'grampadsbot-sudo/timesyncher';
const API = `/repos/${REPO}`;
const LABELS = ['customer-suite', 'bug', 'executor:claude'];
const EVIDENCE = 'customer-suite-evidence';
const BELL = path.join(os.homedir(), 'tsv-dispatch', 'bell_gate.py');

async function github(route, method = 'GET', body) {
  const credentialPath = process.env.VK_CUSTOMER_SUITE_GH_TOKEN_FILE
    || path.join(os.homedir(), '.config', 'tsv-gateb', 'gh-token');
  const token = fs.readFileSync(credentialPath, 'utf8').trim();
  if (!token) throw new Error('GitHub credential for VK customer suite is unavailable');
  const res = await fetch(`https://api.github.com${API}${route}`, {
    method, redirect: 'error',
    headers: {
      authorization: `Bearer ${token}`, accept: 'application/vnd.github+json',
      'content-type': 'application/json', 'user-agent': 'vk-customer-suite',
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok) throw Object.assign(new Error(`GitHub ${method} returned HTTP ${res.status}`), { status: res.status });
  return res.status === 204 ? null : res.json();
}

async function upload(file, run, request) {
  const name = path.basename(file);
  if (!/^[a-z0-9-]+-(390|1280)\.png$/.test(name)) throw new Error('unexpected screenshot filename');
  const object = `vk/${run.run}/${name}`;
  const body = { branch: EVIDENCE, content: fs.readFileSync(file).toString('base64'), message: `VK customer suite evidence ${run.run}` };
  try {
    await request(`/contents/${object}`, 'GET', undefined, EVIDENCE);
  } catch (error) {
    if (error.status !== 404) throw error;
    await request(`/contents/${object}`, 'PUT', body);
  }
  return `https://github.com/${REPO}/blob/${EVIDENCE}/${object}?raw=true`;
}

async function prepare(request) {
  try {
    await request('/labels/customer-suite');
  } catch (error) {
    if (error.status !== 404) throw error;
    await request('/labels', 'POST', { name: 'customer-suite', color: '5319e7', description: 'Vacation Keepsake synthetic customer suite (#1075)' });
  }
  try {
    await request(`/git/ref/heads/${EVIDENCE}`);
  } catch (error) {
    if (error.status !== 404) throw error;
    const tree = await request('/git/trees', 'POST', { tree: [
      { path: 'vercel.json', type: 'blob', mode: '100644', content: '{"git":{"deploymentEnabled":false}}\n' },
    ] });
    const commit = await request('/git/commits', 'POST', { message: 'Initialize VK screenshot evidence branch', tree: tree.sha, parents: [] });
    await request('/git/refs', 'POST', { ref: `refs/heads/${EVIDENCE}`, sha: commit.sha });
  }
}

function ring(issue, scenario) {
  const result = spawnSync('python3', [
    BELL, '--ring', '--reason', 'eggbot_decision', '--source', 'vk-customer-suite',
    '--slug', 'bot-admin/lanes/vk-customer-suite',
    '--msg', `Vacation Keepsake customer suite: ${scenario} failed on staging. ${REPO}#${issue.number}`,
  ], { encoding: 'utf8', timeout: 60_000 });
  return result.status === 0 ? (result.stdout.trim().split('\n').at(-1) || 'ok') : 'bell command failed';
}

export async function reportFailures(run, {
  request = (route, method, body, ref) => github(ref ? `${route}?ref=${encodeURIComponent(ref)}` : route, method, body),
  notify = ring,
} = {}) {
  if (run.target !== STAGING || run.verifiedSha !== run.sha) return [];
  const failing = run.checks.filter((s) => s.evidence.some((e) => e.screenshot && e.assertions.some((a) => !a.pass)));
  if (!failing.length) return [];
  await prepare(request);
  const issues = new Map();
  for (let page = 1; ; page += 1) {
    const rows = await request(`/issues?labels=customer-suite&state=open&per_page=100&page=${page}`);
    for (const i of rows.filter((i) => !i.pull_request)) {
      const scenario = i.body?.match(/<!-- vk-customer-suite:([a-z0-9-]+) -->/)?.[1];
      if (scenario && !issues.has(scenario)) issues.set(scenario, i);
    }
    if (rows.length < 100) break;
  }
  const actions = [];
  for (const s of failing) {
    const text = [`<!-- vk-customer-suite:${s.id} -->`, '', `Vacation Keepsake staging build \`${run.sha}\`, run \`${run.run}\`.`, ''];
    for (const e of s.evidence) {
      const failed = e.assertions.filter((a) => !a.pass);
      if (!failed.length || !e.screenshot) continue;
      for (const a of failed) text.push(`- ${e.width}px expected ${a.expected}${a.actual ? `. Found: ${a.actual}` : ''}`);
      text.push(`![${e.width}px staging screenshot](${await upload(e.screenshot, run, request)})`, '');
    }
    const old = issues.get(s.id);
    if (old) {
      await request(`/issues/${old.number}/comments`, 'POST', { body: text.slice(1).join('\n') });
      actions.push({ scenario: s.id, issue: old.number, action: 'updated', bell: null });
    } else {
      const name = s.name || s.id.replaceAll('-', ' ');
      const fresh = await request('/issues', 'POST', { title: `Customer suite: ${name} fails on staging`, body: text.join('\n'), labels: LABELS });
      actions.push({ scenario: s.id, issue: fresh.number, action: 'created', bell: await notify(fresh, s.id) });
    }
  }
  return actions;
}
