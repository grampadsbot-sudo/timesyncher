#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Scenario } from './harness.mjs';
import { LABELS, marker, reportRun } from './report.mjs';
import { REPO, gh } from './config.mjs';

function fakeGitHub() {
  const issues = [];
  const comments = [];
  const files = new Map();
  const labels = [];
  let ref = false;
  let n = 1000;
  const request = async (p, { method = 'GET', body } = {}) => {
    const u = p.replace(`/repos/${REPO}`, '');
    if (u.startsWith('/labels')) {
      if (method === 'POST') labels.push(body.name);
      return labels.map((name) => ({ name }));
    }
    if (u.startsWith('/git/ref/heads/')) {
      if (!ref) throw Object.assign(new Error('404'), { status: 404 });
      return { object: { sha: 'abc' } };
    }
    if (u === '/git/trees') return { sha: 'tree1' };
    if (u === '/git/commits') return { sha: 'commit1', parents: body.parents };
    if (u === '/git/refs') {
      ref = true;
      return {};
    }
    if (u.startsWith('/contents/')) {
      files.set(u, body);
      return {};
    }
    if (u.startsWith('/issues?')) return issues.filter((i) => i.state === 'open');
    let m = u.match(/^\/issues\/(\d+)\/comments$/);
    if (m) {
      comments.push({ issue: Number(m[1]), body: body.body });
      return {};
    }
    m = u.match(/^\/issues\/(\d+)$/);
    if (m && method === 'PATCH') {
      Object.assign(issues.find((i) => i.number === Number(m[1])), body);
      return {};
    }
    if (u === '/issues' && method === 'POST') {
      n += 1;
      const created = { number: n, state: 'open', html_url: `https://github.com/${REPO}/issues/${n}`, ...body };
      issues.push(created);
      return created;
    }
    throw new Error(`fake GitHub: unhandled ${method} ${u}`);
  };
  return { api: { request }, issues, comments, files, labels };
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vk-suite-c10-'));
const makeRun = (id) => {
  const dir = path.join(tmp, id);
  const shotsDir = path.join(dir, 'screenshots');
  fs.mkdirSync(shotsDir, { recursive: true });
  return { id, dir, shotsDir };
};
const PNG = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex');

function makeScenario(run, id, title, fail) {
  const sc = new Scenario(run, id, title);
  const shots = {};
  for (const w of [390, 1280]) {
    shots[w] = path.join(run.shotsDir, `${id}-01-step-${w}.png`);
    fs.writeFileSync(shots[w], PNG);
  }
  sc.steps.push({ step: 'preview-card', screenshots: shots });
  sc.check('preview-card', 'visible text "Approved and live on your vacation"', !fail, fail ? 'Pending approval' : 'Approved and live on your vacation');
  return sc;
}

try {
  const target = { base: 'https://vacation-staging.timesyncher.com', sha: '8ee99a376c17ced979606decdd143d783320c179' };
  const gh1 = fakeGitHub();
  const rings = [];
  const ring = (msg) => {
    rings.push(msg);
    return 'ok';
  };

  const r1 = makeRun('20261121T000000Z');
  const a1 = await reportRun({
    run: r1,
    target,
    scenarios: [
      makeScenario(r1, 'S1', 'Sign up', true),
      makeScenario(r1, 'S3', 'Website flow', false),
      makeScenario(r1, 'S6', 'Chat-first AI import through MCP', true),
    ],
    api: gh1.api,
    ring,
  });
  assert.deepEqual(a1.map((a) => `${a.scenario}:${a.action}`), ['S1:created', 'S6:created']);
  assert.equal(gh1.issues.length, 2);
  assert.equal(rings.length, 2);
  const s1Issue = gh1.issues.find((i) => i.body.includes(marker('S1')));
  assert.ok(s1Issue.body.includes('Approved and live on your vacation') && s1Issue.body.includes('Pending approval'));
  assert.ok(/<img src="https:\/\/github\.com\/[^"]+customer-suite-evidence\/vk\/20261121T000000Z\/S1-01-step-390\.png\?raw=true"/.test(s1Issue.body));
  assert.ok(s1Issue.body.includes('S1-01-step-1280.png'));
  assert.ok(s1Issue.body.includes(path.join(r1.dir, 'results.json')));
  assert.deepEqual(s1Issue.labels, LABELS.map((l) => l.name));
  assert.equal(gh1.files.size, 4);

  const r2 = makeRun('20261121T020000Z');
  const a2 = await reportRun({
    run: r2,
    target,
    scenarios: [
      makeScenario(r2, 'S1', 'Sign up', true),
      makeScenario(r2, 'S6', 'Chat-first AI import through MCP', false),
    ],
    api: gh1.api,
    ring,
  });
  assert.deepEqual(a2.map((a) => `${a.scenario}:${a.action}`), ['S1:updated', 'S6:closed']);
  assert.equal(gh1.issues.length, 2);
  assert.equal(rings.length, 2);
  assert.ok(gh1.comments.some((c) => c.issue === s1Issue.number && c.body.includes('failed again') && c.body.includes('S1-01-step-390.png')));
  assert.equal(gh1.issues.find((i) => i.body.includes(marker('S6'))).state, 'closed');

  const r3 = makeRun('20261121T040000Z');
  const a3 = await reportRun({
    run: r3,
    target,
    scenarios: [makeScenario(r3, 'S6', 'Chat-first AI import through MCP', true)],
    api: gh1.api,
    ring,
  });
  assert.deepEqual(a3.map((a) => `${a.scenario}:${a.action}`), ['S6:created']);
  assert.equal(rings.length, 3);
  assert.ok(!/ghp_|gho_|vkm_|sk_live_/.test(JSON.stringify(gh1.issues)));

  const gh2 = fakeGitHub();
  const r4 = makeRun('20261121T060000Z');
  const b2 = makeScenario(r4, 'S2', 'Create a vacation by chat', false);
  b2.blocked = 'S1 did not produce a signed-in owner session';
  const ringsBefore = rings.length;
  const a4 = await reportRun({
    run: r4,
    target,
    scenarios: [makeScenario(r4, 'S1', 'Sign up', true), b2],
    api: gh2.api,
    ring,
  });
  assert.deepEqual(a4.map((a) => `${a.scenario}:${a.action}`), ['S1:created']);
  assert.equal(gh2.issues.length, 1);
  assert.ok(gh2.issues[0].body.includes('Blocked by this failure') && gh2.issues[0].body.includes('S2 Create a vacation by chat'));
  assert.equal(rings.length, ringsBefore + 1);

  let live = null;
  if (process.argv.includes('--live-proof')) {
    live = ((await gh(`/repos/${REPO}/issues?state=all&labels=customer-suite&per_page=20`)) || []).map((i) => ({
      number: i.number,
      state: i.state,
      title: i.title,
      labels: i.labels.map((l) => l.name),
    }));
  }
  console.log(JSON.stringify({
    row: 'c10-auto-issue-filing',
    ok: true,
    runs: { r1: a1, r2: a2, r3: a3, r4: a4 },
    rings: rings.length,
    issues: gh1.issues.map((i) => ({ number: i.number, state: i.state, title: i.title, labels: i.labels })),
    live,
  }, null, 2));
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
