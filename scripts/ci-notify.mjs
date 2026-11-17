import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

const BASE_BRANCH = 'vk';
const WATCHED_JOBS = new Set(['unit-tests']);
const WATCHED_STATUSES = new Set(['gateb']);
const FINAL_STATUS = new Set(['success', 'failure', 'error']);
const PASS = new Set(['success']);

function verdict(state) {
  return PASS.has(state) ? 'pass' : 'fail';
}

export function noteKey(note) {
  return ['tsv-notify', note.pr, note.sha.slice(0, 12), note.check, note.result].join('-');
}

export function formatLine(note) {
  return `PR #${note.pr} ${note.sha.slice(0, 8)} ${note.check}: ${note.result} ${note.url}`;
}

export function notesFromPullRequest(payload) {
  const pr = payload.pull_request;
  if (payload.action !== 'closed' || !pr || pr.base.ref !== BASE_BRANCH) return [];
  const merged = Boolean(pr.merged);
  return [{
    pr: pr.number,
    sha: merged && pr.merge_commit_sha ? pr.merge_commit_sha : pr.head.sha,
    check: merged ? 'merge' : 'closed',
    result: merged ? 'merged' : 'closed-unmerged',
    url: pr.html_url,
  }];
}

export function notesFromStatus(payload, prs) {
  if (!WATCHED_STATUSES.has(payload.context) || !FINAL_STATUS.has(payload.state)) return [];
  return prs
    .filter((pr) => pr.base.ref === BASE_BRANCH && pr.state === 'open')
    .map((pr) => ({
      pr: pr.number,
      sha: payload.sha,
      check: payload.context,
      result: verdict(payload.state),
      url: payload.target_url || pr.html_url,
    }));
}

export function notesFromWorkflowRun(payload, jobs) {
  const run = payload.workflow_run;
  if (!run || payload.action !== 'completed') return [];
  const prs = (run.pull_requests || []).filter((pr) => pr.base.ref === BASE_BRANCH);
  const done = jobs.filter((job) => WATCHED_JOBS.has(job.name) && job.status === 'completed');
  return prs.flatMap((pr) => done.map((job) => ({
    pr: pr.number,
    sha: run.head_sha,
    check: job.name,
    result: verdict(job.conclusion),
    url: job.html_url || run.html_url,
  })));
}

async function github(pathPart) {
  const res = await fetch(`https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}/${pathPart}`, {
    headers: { authorization: `Bearer ${process.env.GITHUB_TOKEN}`, accept: 'application/vnd.github+json' },
  });
  if (!res.ok) throw new Error(`github ${pathPart} ${res.status}`);
  return res.json();
}

async function collect(eventName, payload) {
  if (eventName === 'pull_request' || eventName === 'pull_request_target') return notesFromPullRequest(payload);
  if (eventName === 'status') return notesFromStatus(payload, await github(`commits/${payload.sha}/pulls`));
  if (eventName === 'workflow_run') {
    const data = await github(`actions/runs/${payload.workflow_run.id}/jobs?per_page=100`);
    return notesFromWorkflowRun(payload, data.jobs || []);
  }
  return [];
}

async function post(url, body) {
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`post failed ${res.status}`);
}

export async function send(note, env = process.env) {
  const line = formatLine(note);
  const sent = [];
  if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) {
    await post(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      chat_id: env.TELEGRAM_CHAT_ID,
      text: line,
      disable_web_page_preview: true,
    });
    sent.push('telegram');
  }
  if (env.MDR_INBOX_URL) {
    await post(env.MDR_INBOX_URL, { kind: 'ci-result', line, ...note });
    sent.push('mdr-inbox');
  }
  return sent;
}

async function main() {
  const payload = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
  const notes = await collect(process.env.GITHUB_EVENT_NAME, payload);
  const keys = notes.map(noteKey);
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `keys=${keys.join(' ')}\n`);
  }
  if (process.argv.includes('--plan')) {
    process.stdout.write(`${notes.length} note(s)\n`);
    return;
  }
  for (const note of notes) {
    const sent = await send(note);
    process.stdout.write(`${formatLine(note)} -> ${sent.join(',') || 'no channel configured'}\n`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((error) => {
    process.stderr.write(`ci-notify: ${error.message}\n`);
    process.exit(1);
  });
}
