# VK PR #604 / issue #601 receipt (cursor-ubuntu vkfill-604 rethink round 1, 2026-10-22)

**Handoff:** `bot-admin/lanes/vk-pr-handoff/pr-604` (chief dr option a: CSS emoji fallback centering).

**Start sha:** `7a82b21f5de6d5d8535ab728c1816a873dd72fcc`

## Step 1 — base merge

Host merged `origin/migrate/trek-source` @ `93ac0a342fb1494af672f36d80359755c6aaaace` into `7a82b21f`. Conflicts resolved: kept PR `J/RECEIPT.md` / `J/PR_DESCRIPTION.md`; rebaked `public/assets/index-BKun7ofk.js` after patches.

## Step 2 — emoji fallback vertical center (CSS only)

Removed runtime `tsCenterThingLogoFallback` / `tsCenterListLogoFallbackDom` (did not move measured pixels on Ubuntu Gate B). Generic fix: `transform: translateY(-2.5px)` on the **fallback glyph only** (`tsv-logo-fallback` / `thing-emoji` in chip) in TREK `dc()`, shared live-tab HTML, and vacation-client CSS. Real-logo `translateY` from offline ink table unchanged.

## Measurement (Gate B row-name-frame, ink-bbox threshold 24, tol 1.5 px)

**Before** (Ubuntu Playwright capture, Gate B `20261022-111416` on head `0aa9f367`, cited in handoff): emoji-fallback rows **low** vs first name line — e.g. Amelie Bistro & Wine Bar **3 px**, e's BAR group **3 px**, Carbone **3 px**; stores/hotels **2.5 px**; cars/flights **2 px**.

**After** (lane worktree; same rule as `~/tsv-gateb/lib/row-name-frame.mjs` — expected from static `translateY(-2.5px)` on glyph box): nominal offset **≤0.5 px** on those rows (within 1.5 px). **Host Ubuntu Gate B on published head is authority** for gap_close PASS.

## Local verification

| Check | Result |
| --- | --- |
| `node scripts/rebake_served_trek_bundle.mjs` | 0 (`sha256=33ea41dbf99bb822157a4e7adf1feb0a3626d1ee7ccf9882ef2c7fe4fb390a51`) |
| `node scripts/test_thing_logo_ink_center.mjs` | 0 |
| `node scripts/test_shared_logo_chip_center_bundle.mjs` | 0 |
| `node scripts/check-no-comments.mjs` | 0 |
| `node scripts/test_offline_manifest.mjs` | 0 |
| `BASE=codex/ruling95-consolidated-logo node scripts/check-code-ratchet.mjs` | 0 |

## Tip sha

(filled after local commit)
