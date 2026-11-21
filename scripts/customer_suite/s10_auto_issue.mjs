#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { reportFailures } from './report.mjs';
import { STAGING } from './staging.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vk-suite-reporter-'));
const issues = [];
const comments = [];
const uploads = [];
const rings = [];
const missing = () => { throw Object.assign(new Error('missing'), { status: 404 }); };
const request = async (url, method = 'GET', body) => {
  if (url.startsWith('/issues?')) return issues;
  if (url === '/issues' && method === 'POST') {
    const issue = { ...body, number: issues.length + 1 };
    issues.push(issue);
    return issue;
  }
  if (url.endsWith('/comments')) return comments.push(body);
  if (url.startsWith('/contents/')) {
    if (method === 'GET') return uploads.includes(url) || missing();
    assert.ok(body.content);
    return uploads.push(url);
  }
  if (url === '/labels/customer-suite' || url.startsWith('/git/ref/heads/')) return {};
  throw new Error(`unexpected operation ${method} ${url}`);
};
const options = { request, notify: (issue) => rings.push(issue.number) };
const sha = 'a'.repeat(40);
const evidence = [390, 1280].map((width) => {
  const screenshot = path.join(root, `website-entry-${width}.png`);
  fs.writeFileSync(screenshot, 'fake screenshot bytes');
  return { width, screenshot, assertions: [{ expected: 'vacation copy', pass: false }] };
});
const fixture = { target: STAGING, sha, verifiedSha: sha, run: 'first', checks: [{ id: 'website-entry', evidence }] };

try {
  assert.equal((await reportFailures(fixture, options))[0].action, 'created');
  assert.equal((await reportFailures({ ...fixture, run: 'second' }, options))[0].action, 'updated');
  assert.equal(issues.length, 1);
  assert.equal(comments.length, 1);
  assert.equal(uploads.length, 4);
  assert.deepEqual(rings, [1]);
  assert.deepEqual(issues[0].labels, ['customer-suite', 'bug', 'executor:claude']);
  for (const { body } of [...issues, ...comments]) {
    assert.match(body, /390px expected vacation copy/);
    assert.match(body, /1280px expected vacation copy/);
    assert.match(body, /website-entry-390\.png/);
    assert.match(body, /website-entry-1280\.png/);
  }
  console.log(JSON.stringify({ row: 'c10-auto-issue-filing', ok: true, issues: 1, updates: 1, rings: 1 }));
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
