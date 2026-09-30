import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const PROJECT = 'timesyncher-vacation-staging';
export function loadRequiredEnv() {
  return JSON.parse(readFileSync(new URL('./deploy-required-env.json', import.meta.url), 'utf8')).map((row) => row.name);
}
export function editDistance(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 3;
  let prev = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const row = [i];
    for (let j = 1; j <= b.length; j += 1) row[j] = a[i - 1] === b[j - 1] ? prev[j - 1] : Math.min(prev[j - 1], prev[j], row[j - 1]) + 1;
    if (Math.min(...row) > 2) return 3;
    prev = row;
  }
  return prev[b.length];
}
export function compareEnvNames(required, present) {
  const have = new Set(present);
  const missing = required.filter((name) => !have.has(name));
  const near = [];
  for (const name of present) for (const want of required) if (name !== want && editDistance(name, want) <= 2) near.push({ name, want });
  return { missing, near };
}
function teamId() {
  const fromEnv = process.env.VERCEL_ORG_ID || process.env.VERCEL_TEAM_ID;
  if (fromEnv) return fromEnv;
  try {
    return JSON.parse(readFileSync(new URL('../.vercel/project.json', import.meta.url), 'utf8')).orgId || '';
  } catch {
    return '';
  }
}
async function teamIds(token, fetchImpl) {
  const response = await fetchImpl('https://api.vercel.com/v2/teams', { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) return [];
  return ((await response.json()).teams || []).map((row) => row.id).filter(Boolean);
}
export async function listEnvNames({ project, target, token, team = teamId(), fetchImpl = fetch }) {
  const teams = team ? [team] : ['', ...await teamIds(token, fetchImpl)];
  let status = 0;
  for (const id of teams) {
    const params = new URLSearchParams({ decrypt: 'false' });
    if (id) params.set('teamId', id);
    const response = await fetchImpl(`https://api.vercel.com/v9/projects/${encodeURIComponent(project)}/env?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    status = response.status;
    if (!response.ok) continue;
    const names = [];
    for (const row of (await response.json()).envs || []) {
      if (typeof row?.key === 'string' && row.key && [].concat(row.target || []).includes(target)) names.push(row.key);
    }
    return [...new Set(names)].sort();
  }
  throw new Error(`vercel env list failed: HTTP ${status}`);
}
export async function runPreflight({ project = PROJECT, target = 'production', token = process.env.VERCEL_TOKEN || '', present, fetchImpl } = {}) {
  const required = loadRequiredEnv();
  if (!present && !token) return { ok: false, text: 'VERCEL_TOKEN is not set\n', missing: required, near: [] };
  const compared = compareEnvNames(required, present || await listEnvNames({ project, target, token, fetchImpl }));
  const lines = [
    ...compared.missing.map((name) => `missing: ${name}`),
    ...compared.near.map((hit) => `near-miss: ${hit.name} for ${hit.want}`),
  ];
  return { ok: lines.length === 0, text: lines.length ? `${lines.join('\n')}\n` : `required env present for ${project} ${target}\n`, ...compared };
}
async function main() {
  const [project = PROJECT, target = 'production'] = process.argv.slice(2);
  const result = await runPreflight({ project, target });
  (result.ok ? process.stdout : process.stderr).write(result.text);
  if (!result.ok) process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
