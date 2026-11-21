import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { BELL, REPO, gh, scrub } from './config.mjs';

export const LABELS = [
  { name: 'customer-suite', color: '5319e7', description: 'Filed by the host customer suite (issue #1075)' },
  { name: 'executor:claude', color: '0e8a16', description: 'Coder lane: Claude' },
  { name: 'base:vk', color: '1d76db', description: 'Target base branch: vk' },
  { name: 'bug', color: 'd73a4a', description: "Something isn't working" },
];
const EVIDENCE_BRANCH = 'customer-suite-evidence';
const BELL_SLUG = 'bot-admin/lanes/vk-customer-suite';
export const marker = (scenarioId) => `<!-- vk-customer-suite:${scenarioId} -->`;

function githubClient() {
  return {
    request: (p, opts) => gh(p, opts),
  };
}

async function ensureLabels(api) {
  const existing = (await api.request(`/repos/${REPO}/labels?per_page=100`)) || [];
  const have = new Set(existing.map((l) => l.name));
  for (const label of LABELS) {
    if (!have.has(label.name)) {
      await api.request(`/repos/${REPO}/labels`, { method: 'POST', body: label }).catch(() => null);
    }
  }
}

async function ensureEvidenceBranch(api) {
  try {
    await api.request(`/repos/${REPO}/git/ref/heads/${EVIDENCE_BRANCH}`);
    return;
  } catch (error) {
    if (error?.status !== 404) throw error;
  }
  const files = {
    'README.md': '# Customer suite evidence\n\nFailure screenshots attached to `customer-suite` issues by the host suite (issue #1075). Not code; never merged.\n',
    'vercel.json': `${JSON.stringify({ git: { deploymentEnabled: false } }, null, 2)}\n`,
  };
  const tree = await api.request(`/repos/${REPO}/git/trees`, {
    method: 'POST',
    body: {
      tree: Object.entries(files).map(([filePath, content]) => ({
        path: filePath,
        mode: '100644',
        type: 'blob',
        content,
      })),
    },
  });
  const commit = await api.request(`/repos/${REPO}/git/commits`, {
    method: 'POST',
    body: { message: 'Customer suite evidence branch (no deploys)', tree: tree.sha, parents: [] },
  });
  await api.request(`/repos/${REPO}/git/refs`, {
    method: 'POST',
    body: { ref: `refs/heads/${EVIDENCE_BRANCH}`, sha: commit.sha },
  });
}

async function uploadShot(api, runId, file) {
  const rel = `vk/${runId}/${path.basename(file)}`;
  const content = fs.readFileSync(file).toString('base64');
  await api.request(`/repos/${REPO}/contents/${rel}`, {
    method: 'PUT',
    body: { message: `evidence ${runId} ${path.basename(file)}`, content, branch: EVIDENCE_BRANCH },
  }).catch((error) => {
    if (error?.status !== 422) throw error;
  });
  return `https://github.com/${REPO}/blob/${EVIDENCE_BRANCH}/${rel}?raw=true`;
}

function failureBody(sc, run, target, shotLinks, blocked = []) {
  const fails = sc.failures().slice(0, 12);
  const host = new URL(target.base).host;
  const shaNote = target.sha ? ` at \`${String(target.sha).slice(0, 12)}\`` : '';
  const lines = [
    marker(sc.id),
    `**${sc.id} ${sc.title}** failed in customer-suite run \`${run.id}\`.`,
    '',
    `- Target: \`${host}\`${shaNote}`,
    `- Run JSON: \`${path.join(run.dir, 'results.json')}\` (host)`,
    '',
    '### Failed assertions',
    '',
    '| Step | Expected | Actual |',
    '| --- | --- | --- |',
    ...fails.map((f) => `| ${f.step} | ${String(f.expect).replace(/\|/g, '\\|')} | ${String(f.actual ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ').slice(0, 200)} |`),
    '',
    ...(blocked.length ? ['### Blocked by this failure', '', ...blocked.map((b) => `- ${b.id} ${b.title}: ${b.blocked}`), ''] : []),
    '### Screenshots',
    '',
    ...Object.entries(shotLinks).map(([w, link]) => `**${w}px**<br><img src="${link.url}" width="${w === '390' ? 260 : 520}"><br>host: \`${link.host}\``),
    '',
    'Filed by the host customer suite (issue #1075). Repeat failures update this issue without ringing the doorbell; passing closes it.',
  ];
  return scrub(lines.join('\n'));
}

function ringBell(text, { dry } = {}) {
  if (dry) return 'dry';
  const r = spawnSync(
    'python3',
    [BELL, '--ring', '--source', 'vk-customer-suite', '--reason', 'eggbot_decision', '--slug', BELL_SLUG, '--msg', scrub(text).slice(0, 1400)],
    { encoding: 'utf8', timeout: 60000 },
  );
  return (r.stdout || '').trim().split('\n').at(-1) || `rc${r.status}`;
}

export async function reportRun({ run, target, scenarios, api = githubClient(), ring = ringBell, dryBell = false }) {
  const actions = [];
  await ensureLabels(api);
  const open = (await api.request(`/repos/${REPO}/issues?state=open&labels=customer-suite&per_page=100`)) || [];
  const byScenario = (id) => open.find((issue) => !issue.pull_request && String(issue.body || '').includes(marker(id)));
  const blocked = scenarios.filter((s) => s.blocked);
  for (const sc of scenarios) {
    if (sc.skipped || sc.blocked) continue;
    const existing = byScenario(sc.id);
    if (sc.ok) {
      if (existing) {
        const shaNote = target.sha ? ` on \`${String(target.sha).slice(0, 12)}\`` : '';
        await api.request(`/repos/${REPO}/issues/${existing.number}/comments`, {
          method: 'POST',
          body: { body: `${sc.id} passed again in run \`${run.id}\`${shaNote}. Closing; a later failure opens a new issue.` },
        });
        await api.request(`/repos/${REPO}/issues/${existing.number}`, {
          method: 'PATCH',
          body: { state: 'closed', state_reason: 'completed' },
        });
        actions.push({ scenario: sc.id, action: 'closed', issue: existing.number, bell: null });
      }
      continue;
    }
    await ensureEvidenceBranch(api);
    const shotLinks = {};
    for (const [w, file] of Object.entries(sc.failureShots())) {
      if (file && fs.existsSync(file)) {
        shotLinks[w] = { url: await uploadShot(api, run.id, file), host: file };
      }
    }
    const body = failureBody(sc, run, target, shotLinks, blocked);
    if (existing) {
      await api.request(`/repos/${REPO}/issues/${existing.number}/comments`, {
        method: 'POST',
        body: { body: body.replace(marker(sc.id), '').replace(' failed in', ' failed again in') },
      });
      actions.push({ scenario: sc.id, action: 'updated', issue: existing.number, bell: 'not rung (repeat of an open failure)' });
    } else {
      const first = sc.failures()[0];
      const title = scrub(`Customer suite: ${sc.id} ${sc.title} failing on staging (${String(first?.expect || 'error').slice(0, 70)})`);
      const issue = await api.request(`/repos/${REPO}/issues`, {
        method: 'POST',
        body: { title, body, labels: LABELS.map((l) => l.name) },
      });
      const bell = ring(
        `VK customer suite: NEW failure ${sc.id} ${sc.title} on vacation-staging -> ${REPO}#${issue.number} ${issue.html_url || ''} (${String(first?.expect || '').slice(0, 120)})`,
        { dry: dryBell },
      );
      actions.push({ scenario: sc.id, action: 'created', issue: issue.number, bell });
    }
  }
  return actions;
}
