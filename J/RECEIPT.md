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

GBrain handoff `bot-admin/lanes/vk-pr-handoff/pr-867`: page_not_found on fetch (not in GBrain at lane launch).

## Host base merge (PR #867 / #859, 2026-11-09 ~11:45 AM PT)

Host merged `origin/vk` at `1f1d4c3f9459c1801397868c77cf66ffe26efa84` into PR head `2a70b4e3b9ca187141c2dbd3d373451d3798e501`. Conflicts: `scripts/test_chat_itinerary_edit.mjs`, `src/vacation/chat-itinerary-edit.mjs`. Resolution: keep #859 intent module (`chat-itinerary-edit-intent.mjs` + coalesce/retry path in `chat-itinerary-edit.mjs`); keep vk undo/set_time integration tests and copy-trip staging Carbone resolve probe in the test file. `J/RECEIPT.md` kept PR receipt (this file) plus this merge note.

## Host base merge (PR #867, second pass — 2026-11-09)

Host merged `origin/vk` at `d25b86b355623efe24dc56a252db47a19eeb80b0` into PR head `d6ebb9a04afcf99065086598bf6d96dbdff542d7`. Conflicted files: `J/RECEIPT.md` only. vk #877 pic-popup changes merged without conflict (`public/ts-pic-popup-viewer.js`, `src/vacation/list-row-pic-popup-audit.mjs`, `scripts/test_ui_877_pic_popup_media_strip*.mjs`). Receipt kept PR text (not vk #877-only receipt).

## Base-merge local proof (cursor round, start HEAD `d6ebb9a0`)

| Command | Result |
| --- | --- |
| `timeout 120 node scripts/test_chat_itinerary_edit.mjs` | PASS |
| `cd apps/vacation-client && timeout 900 npm test` | PASS |
| `node scripts/test_ui_877_pic_popup_media_strip.mjs` | PASS |
| `node scripts/test_ui_877_pic_popup_media_strip_chrome.mjs` | PASS |
| `node scripts/check-no-comments.mjs` | PASS (after `apps/vacation-client` npm ci) |
| `node scripts/test_offline_manifest.mjs` | PASS (428 offline) |
| `BASE=vk node scripts/check-code-ratchet.mjs` | PASS |
| `node scripts/run-offline-tests.mjs` | **FAIL** at `scripts/test_live_transcript_dialog_pdf.mjs:651` (`gbrain-cli-get_page` vs `bundled-get_page`); prior scripts PASS — unrelated to merge |

## Uncommitted (host `git add` + merge commit)

- `J/RECEIPT.md` — conflict resolved (PR receipt + merge notes).
- Staged from vk: `public/ts-pic-popup-viewer.js`, `src/vacation/list-row-pic-popup-audit.mjs`, `scripts/test_ui_877_pic_popup_media_strip.mjs`, `scripts/test_ui_877_pic_popup_media_strip_chrome.mjs`.
- Prior round: `src/vacation/chat-itinerary-edit.mjs`, `scripts/test_chat_itinerary_edit.mjs` already on PR head — unchanged this pass.
