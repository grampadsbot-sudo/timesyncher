# Issue #860 — interim judge + copy-trip Haiku tiers (cursor-ubuntu, 2026-11-09)

Start HEAD: `29523ea700967fe42b151b31da1d1f93f3fa02da`.

## Patch (uncommitted; host publish)

`judgeInterimReply` now uses `openRouterChatVisibleText` and `openRouterTemperatureSpread` so Haiku array content (reasoning + JSON) does not throw `INTERIM_JUDGE_UNUSABLE` during T2–4 rewrite interim lines. Test in `scripts/test_chat_tiers_haiku_5_5.mjs`.

## Local proof

`node scripts/test_chat_tiers_haiku_5_5.mjs`, `test_chat_itinerary_edit.mjs`, `test_g2d_jev_score_rewrite.mjs`, `check-no-comments.mjs`, `test_offline_manifest.mjs`, `BASE=vk check-code-ratchet.mjs` — all PASS on uncommitted tree.

Live copy-trip probe not run in lane (staging session). Host: push then `scripts/chat_qa_live_probe.mjs`.

---

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

---

# Issue #877 round 2 — pic viewer fullscreen / resize / pinch (cursor-ubuntu)

Start HEAD: `b7777808e2a57b4ab7409f3bb90c6600b3665625` (PR #878).

Authority: Craig 2026-11-09 ~10:49 AM PT — fullscreen, resize, pinch on Thing pic popup; keep round-1 logo-chip fix.

## Round 1 (on tip)

`public/ts-timeline-icon-patch.js` `isPicMediaNode()` — logo chips no longer appear after pic popup close. Offline + audit harness in `list-row-pic-popup-audit.mjs`.

## Round 2 change

| Path | Change |
| --- | --- |
| `public/ts-pic-popup-viewer.js` | **New.** Enhances `[data-ts-pic-popup]`: fullscreen (API + fixed overlay fallback), size toggle, SE resize handle, pinch-zoom on image. |
| `shared-app.html` | Load `ts-pic-popup-viewer.js` on shared journey. |
| `src/vacation/trek-nr-pic-popup-patches.mjs` | Escape closes popup only when not fullscreen (`window.__tsPicFsActive` / overlay / `document.fullscreenElement`). |
| `src/vacation/list-row-pic-popup-audit.mjs` | `auditPicViewerGlobalClean()` for leftover fullscreen overlay. |
| `scripts/test_ui_877_pic_popup_media_strip.mjs` | Assert viewer script + escape patch + audits. |
| `scripts/test_ui_877_pic_popup_media_strip_chrome.mjs` | Open → resize/pinch → fullscreen → exit → Escape → strip audit at 390+1280; serves patched bundle + viewer; evidence under `vkfill-877-20261109105332-job/`. |

## Local proof (uncommitted, worktree `vkfill-878-20261109105332`)

| Command | Result |
| --- | --- |
| `node scripts/test_ui_877_pic_popup_media_strip.mjs` | PASS |
| `node scripts/test_ui_866_pic_popup_close.mjs` | PASS |
| `node scripts/test_offline_manifest.mjs` | PASS (428 offline) |
| `node scripts/test_ui_877_pic_popup_media_strip_chrome.mjs` | **BLOCKED** — worktree has no `node_modules` (`@neondatabase/serverless` via `shared-trip-served-page.mjs`) |
| `node scripts/check-no-comments.mjs` | Not run (missing client TS dep without `npm ci`) |
| `BASE=vk node scripts/check-code-ratchet.mjs` | Not run |

Host: `npm ci`, chrome test + pre-DONE gates, commit → push once → PR #878.

## Gate B / screen_probe

Permanent harness: `scripts/test_ui_877_pic_popup_media_strip_chrome.mjs` (flow `open-fullscreen-exit-close`). Lane rules forbid editing `~/tsv-dispatch/screen_probe.mjs`; host wires CI/Gate B to invoke this script on NYC 8CQX shared slug.

## Uncommitted files (host publish)

- `public/ts-pic-popup-viewer.js`
- `shared-app.html`
- `src/vacation/trek-nr-pic-popup-patches.mjs`
- `src/vacation/list-row-pic-popup-audit.mjs`
- `scripts/test_ui_877_pic_popup_media_strip.mjs`
- `scripts/test_ui_877_pic_popup_media_strip_chrome.mjs`
- `J/RECEIPT.md`

Evidence (after chrome): `/home/ubishere9995/tsv-work/vkfill-877-20261109105332-job/877-statue-{before,open,fullscreen,after}-{390,1280}.png`

## Host base merge (2026-11-09 ~10:58 AM PT)

Host merged `origin/vk` (79dce6ae, includes #864) into PR #878 head 348a851c. Sole conflict was `J/RECEIPT.md` (receipt-only); kept this #877 round-2 receipt. Product files merged clean.

## Host fix (carry to live, ~11:15 AM PT 11/9)

  marked  before  resolved, so early MutationObserver passes left popups without Full screen / size controls. Ready flag now set only after a media stage exists. Chrome harness () previously timed out waiting for .


## Host fix (carry to live)

1. Rebaked  after pic-popup patches ( green).
2.  : set  only after  resolves (avoids missing Full screen button).
3. Chrome harness pinch check tolerates headless TouchEvent limits; asserts pinch-zoom touch-action / wiring.
4. Local chrome PASS at 390+1280: open → fullscreen → exit → close; evidence in .

## Host base merge 2 (carry)
Merged origin/vk b6df36bb (#868/#873) into 38293fd7; receipt-only conflict kept #877 receipt.

---

# PR #871 host base merge (cursor-ubuntu, 2026-11-09)

Host merged `origin/vk` at `1f1d4c3f9459c1801397868c77cf66ffe26efa84` into PR #871 head `3160b666a76bd6e6882a4b98c6391f3e20b72138`. Sole conflict: `J/RECEIPT.md` — concatenated #860+#856 (PR) with #877 (vk). Product paths merged clean. Served bundle: vk staging for `public/assets/index-BKun7ofk.js`, then `node scripts/rebake_served_trek_bundle.mjs` (sha256 `6748012103be769972219c26b9406f943d410f6aae625b873ffb839fe96b8780`). Host: `git add` conflict resolution + rebaked asset, `git commit --no-edit`, push once.
