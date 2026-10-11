#!/usr/bin/env node
/** Provision four chat fixture states for verify-layout (DATABASE_URL only; no Vercel). */
import { sql } from '../../../../src/vacation/db.mjs';
import { mintVisualStateCustomers } from '../../../../scripts/shepherd-staging-smoke-visual-states.mjs';

export const VERIFY_LAYOUT_STATE_MAP = {
  v0: 'app-0-vacations',
  v1: 'app-1-no-site',
  v1site: 'app-1-with-site',
  v2: 'app-2-plus',
};

export async function provisionVerifyLayoutChatStates({
  env = process.env,
  SHA7 = 'verify-layout',
  setStage = () => {},
} = {}) {
  const dbUrl = String(env.DATABASE_URL || env.NEON_DATABASE_URL || '').trim();
  if (!dbUrl) {
    throw new Error('DATABASE_URL or NEON_DATABASE_URL is required to provision verify-layout chat states.');
  }
  const BASE = String(env.TIMESYNCHER_TRAVEL_BASE_URL || 'https://vacation-staging.timesyncher.com').replace(/\/?$/, '/');
  const db = sql(env);
  const minted = await mintVisualStateCustomers({ db, BASE, SHA7, setStage });
  const out = {};
  for (const [mintId, sub] of Object.entries(VERIFY_LAYOUT_STATE_MAP)) {
    const row = minted[mintId];
    if (!row?.chatUrl) throw new Error(`provision missing chatUrl for ${mintId}`);
    out[sub] = { chatUrl: row.chatUrl, session: row.session, mintId };
  }
  return out;
}
