#!/usr/bin/env node
import { ensureShepherdStagingSmokeEnv } from './shepherd-staging-smoke-env.mjs';
import {
  JEV_QUALITY_MODEL,
  openRouterAppKey,
  postJevDecisions,
} from './vacation-app-reply-rules.mjs';

export async function runShepherdJevPreflight({ env = process.env, fetchImpl = fetch } = {}) {
  await ensureShepherdStagingSmokeEnv({ env, fetchImpl });
  const apiKey = openRouterAppKey(env);
  if (!apiKey) {
    return {
      ok: false,
      error: 'Jev reply judge needs OPENROUTER_API_KEY or TIMESYNCHER_OPENROUTER_API_KEY',
    };
  }
  const started = Date.now();
  try {
    const response = await postJevDecisions({
      payload: {
        model: JEV_QUALITY_MODEL,
        state: {
          channel: 'shepherd-staging-smoke-preflight',
          customer_turn: 'preflight',
          app_reply: 'preflight ok',
        },
        questions: {
          preflight_ping: {
            type: 'noul',
            instructions: 'Does the app reply acknowledge readiness?',
            criteria: {
              true: 'The reply indicates readiness or ok.',
              false: 'The reply does not indicate readiness.',
            },
          },
        },
      },
      apiKey,
      fetchImpl,
      title: 'Shepherd Staging Smoke Jev Preflight',
    });
    const text = typeof response.text === 'function' ? await response.text() : '';
    let body = {};
    try {
      body = text ? JSON.parse(text) : await response.json();
    } catch {
      return {
        ok: false,
        error: `Jev preflight invalid JSON HTTP ${response.status}`,
        latencyMs: Date.now() - started,
      };
    }
    if (!response.ok || body.ok === false) {
      return {
        ok: false,
        error: String(body.error?.message || body.error || `Jev HTTP ${response.status}`).slice(0, 300),
        latencyMs: Date.now() - started,
        model: body.model || JEV_QUALITY_MODEL,
      };
    }
    return {
      ok: true,
      error: null,
      latencyMs: Date.now() - started,
      model: body.model || JEV_QUALITY_MODEL,
    };
  } catch (err) {
    return {
      ok: false,
      error: String(err?.message || err).slice(0, 300),
      latencyMs: Date.now() - started,
      model: JEV_QUALITY_MODEL,
    };
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await runShepherdJevPreflight();
  process.stdout.write(`${JSON.stringify(result)}\n`);
  process.exit(result.ok ? 0 : 1);
}
