#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

function canonicalSubset(payload) {
  return {
    thingOverrides: payload?.thingOverrides || {},
    assignments: payload?.assignments || {},
    days: payload?.days || [],
  };
}

function sha256Canonical(payload) {
  const json = JSON.stringify(canonicalSubset(payload));
  return crypto.createHash('sha256').update(json).digest('hex');
}

async function fetchPayload(base, slug) {
  const url = `${String(base).replace(/\/+$/, '')}/api/shared/${encodeURIComponent(slug)}/`;
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`fetch_failed ${res.status}`);
  return res.json();
}

async function main() {
  const [mode, dirArg, slugArg, baseArg] = process.argv.slice(2);
  const dir = path.resolve(dirArg || '');
  const slug = String(slugArg || '').trim();
  const base = String(baseArg || process.env.TIMESYNCHER_TREK_PUBLIC_BASE_URL || '').trim();
  if (!mode || !['snapshot', 'restore'].includes(mode)) {
    throw new Error('usage: node scripts/chat_edit_copy_snapshot.mjs snapshot|restore <dir> <slug> [trekBase]');
  }
  if (!dir || !slug) throw new Error('dir and slug are required');
  fs.mkdirSync(dir, { recursive: true });
  const snapPath = path.join(dir, 'thing-overrides-assignments.json');
  if (mode === 'snapshot') {
    if (!base) throw new Error('TREK base URL required for snapshot');
    const payload = await fetchPayload(base, slug);
    const subset = canonicalSubset(payload);
    fs.writeFileSync(snapPath, `${JSON.stringify(subset, null, 2)}\n`);
    process.stdout.write(`snapshot_written ${snapPath}\n`);
    return;
  }
  if (!fs.existsSync(snapPath)) throw new Error(`missing ${snapPath}`);
  const subset = JSON.parse(fs.readFileSync(snapPath, 'utf8'));
  const token = process.env.CHAT_EDIT_RESTORE_WEB_ACCESS || '';
  if (!base || !token) throw new Error('restore requires TREK base and CHAT_EDIT_RESTORE_WEB_ACCESS');
  const res = await fetch(`${base.replace(/\/+$/, '')}/api/shared/${encodeURIComponent(slug)}/overrides`, {
    method: 'PUT',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      cookie: `ts_vacation_web_access=${encodeURIComponent(token)}`,
    },
    body: JSON.stringify({ overrides: subset.thingOverrides || {} }),
  });
  if (!res.ok) throw new Error(`restore_put_failed ${res.status}`);
  process.stdout.write(`restore_ok ${slug}\n`);
}

main().catch((error) => {
  console.error(String(error?.message || error));
  process.exit(1);
});
