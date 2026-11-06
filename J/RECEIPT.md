# PR #826 / #825 — Cursor lane receipt (ui #754 `tsItinLine` two-arg asserts)

Result: **source-ready**, uncommitted patch for host publication. Starting HEAD: `b184a4dacc3b1c1d0d98e25a72d85c083eaae4a2` (unchanged; no commit in lane). Branch: `vkfill/825-20261105070213`. Model: composer-2.5 (cursor-ubuntu). Chief-dr ruling: bot-admin/lanes/vk-pr-handoff/pr-826 (8:26 PM PT 2026-11-05).

## Change

GitHub unit-tests on head `b184a4da` failed at `scripts/test_ui_754_punchlist.mjs:19` (and line 28): stale one-arg `tsItinLine(ua.item)` / `tsItinLine(_i.item)` regexes vs live served bundle `public/assets/index-BKun7ofk.js`, which correctly calls `tsItinLine(ua.item,ua.notes)` and `tsItinLine(_i.item,_i.notes)` for Day-by-Day itinerary notes (#825 / Craig 2026-11-05 6:38 AM PT).

**Fix (test-only):** update ONLY those two `assert.match` patterns in `scripts/test_ui_754_punchlist.mjs`:

- `/(!Zi\(ua\.item\)\|\|String\(ua\.type\|\|""\)==="hotel-event"\)&&tsItinLine\(ua\.item,ua\.notes\)/`
- `/tsItinLine\(_i\.item,_i\.notes\)&&\(!Zi\(_i\.item\)\|\|String\(_i\.type\|\|""\)==="hotel-event"\)/`

**Files (uncommitted):**

- `scripts/test_ui_754_punchlist.mjs` (2 lines)

Prior branch fixes unchanged: `test_gate_b_product_row_fields.mjs:205` (`mr(G)`), `test_shared_tab_filter_chips.mjs`, `data-ts-list-desc` capture leaf + rebake on `b184a4da`.

## Local verification (starting HEAD `b184a4da`)

| Command | Result |
| --- | --- |
| `node scripts/test_ui_754_punchlist.mjs` | exit 0 |
| `node scripts/test_hotel_list_desc_capture_leaf.mjs` | exit 0 |
| `node scripts/test_ui_734_round2_punchlist.mjs` | exit 0 |
| `node scripts/test_shared_tab_filter_chips.mjs` | exit 0 |
| `node scripts/test_gate_b_product_row_fields.mjs` | exit 0 |
| `node scripts/test_list_row_description_substance.mjs` | exit 0 |
| `node scripts/check-no-comments.mjs` | exit 0 (after `npm ci` + `apps/vacation-client` npm ci) |
| `node scripts/test_offline_manifest.mjs` | exit 0 |
| `BASE=vk node scripts/check-code-ratchet.mjs` | exit 0 |
| `git diff --check` | exit 0 |

## Not done in lane (host)

- No commit, push, or PR head move — HOST PUBLICATION ONLY.
- GitHub CI / Gate B not run on a new head here.

## Scope left alone

Product `tsItinLine` wiring, Gate B pixel/overflow/price noise, baselines, checkers, workflows, #827, deploy.
