# Issue #856 — Haiku tiers 2–4 empty app reply (cursor-ubuntu)

Start HEAD: `840c0eec2f6afae59d5295a8c6dfac3b60e3c897` (launch-identity.json).

## Symptom (live staging ca06f886)

Evidence: `/tmp/haiku_live_copy2_out.json`, `/tmp/haiku_retry_hard_turns.json`. Tier 1 PASS; tiers 2–4 `app reply text is empty` with `replyMs` ~70–120 ms (no generation). Live failure matches OpenRouter HTTP 400 latency, not model timeout.

## Root cause (proved before patch)

Direct OpenRouter chat/completions probes on this tree (model `anthropic/claude-haiku-5.5`, key via `~/.local/bin/openrouter-key`; logs `/tmp/haiku_openrouter_probe_before.jsonl`):

| Tier | HTTP | Error / result |
| --- | --- | --- |
| 1 | 200 | Non-empty visible text |
| 2–4 | **400** | `Only one of "reasoning.effort" and "reasoning.max_tokens" can be specified` |

PR #851 (`59756613`) sent **both** `reasoning.effort` and `reasoning.max_tokens` on tiers 2–4. `callOpenRouterTieredChat` treated non-OK bodies as failure → empty reply on staging.

## Fix

| Path | Change |
| --- | --- |
| `scripts/openrouter-tier-provider.mjs` | T2–4 reasoning uses `effort` only (no nested `max_tokens`). Tier request `max_tokens` floors (3072 / 4608 / 6144) cover reasoning + visible 900. Export `openRouterChatVisibleText` for array content that splits reasoning vs text. |
| `scripts/vacation-app-reply-rules.mjs` | `chatReplyText` uses `openRouterChatVisibleText` (ignore `type: reasoning` parts). |
| `scripts/test_chat_tiers_haiku_5_5.mjs` | Assert new reasoning/token shapes; test array-content tier-2 reply path. |
| `scripts/test_g2d_jev_score_rewrite.mjs` | Rewrite call reasoning expectation. |
| `scripts/test_rewrite_ships_tier_draft.mjs` | Tier-3 `max_tokens` 4608 expectation. |

## OpenRouter proof after patch

`/tmp/haiku_openrouter_probe_after.jsonl`: tiers 1–4 all **200**, non-empty visible text (ms 366–551).

## Local proof (uncommitted on `840c0eec`)

| Command | Result |
| --- | --- |
| `node scripts/test_chat_tiers_haiku_5_5.mjs` | PASS |
| `node scripts/test_g2d_jev_score_rewrite.mjs` | PASS |
| `node scripts/test_rewrite_ships_tier_draft.mjs` | PASS |
| `node scripts/check-no-comments.mjs` | PASS |
| `node scripts/test_offline_manifest.mjs` | PASS |
| `BASE=vk node scripts/check-code-ratchet.mjs` | PASS |

## Host publish

Uncommitted patch in `/home/ubishere9995/tsv-work/vkfill-856-20261109081816` (5 files). Host: branch from `840c0eec`, commit → push once → PR into `vk` with `Closes #856`. After tip==live, re-run `/tmp/haiku_live_copy2.py` on copy trip `3a729dac-ad57-4924-8d37-2a18919dd059` (4 turns, all Haiku, non-empty). Gate B unchanged (chat/API only).
