Host base-merge: `origin/vk` `1fc2ef7708aeed7a318b11b9fb3fef518f1b4044` at 3:18 AM PT 11/10 into PR head `7e85afc268263eb6de3d358cdd1078aafb7b9a38`. Conflict: this receipt only (product auto-merged). **Lane start HEAD:** `7e85afc268263eb6de3d358cdd1078aafb7b9a38`. **Model:** composer-2.5. **Outcome:** SOURCE-READY (uncommitted; HOST PUBLICATION ONLY).

# PR #896 / issue #888 — flight time chips @390

## Problem restatement

At 390px, shared-trip and vacation-client flight list cards kept depart and arrive time chips on one horizontal row. Non-shrinking `min-width: max-content` on `.tsv-row-flight-time` and `[data-ts-flight-time="1"]` (`apps/vacation-client/src/styles.css` @media max-width 480px; `ISSUE_888_SERVED_LAYOUT_CSS` in `src/vacation/shared-trip-oe-list-row-patch.mjs`) let full arrival strings extend past the card’s right padding, clipping text and the card border. Day-by-day conflict wrap and airline logos were already correct on this head.

## Product fix (on branch head; preserved through vk merge)

- **Served rows:** `ISSUE_888_SERVED_LAYOUT_CSS` — two-row CSS grid for `[data-ts-flight-row-grid="1"]` at ≤480px; times on row 2; logo/name column spans rows; `SHARED_LIVE_FLIGHT_LOGO_NAME_CSS` for chip alignment.
- **Vacation client:** `.tsv-row-flight-main` @390 — logo row 1 col 1; title stack cols 2–4; price col 4; depart/arrive row 2 cols 3–4.
- **Rebake:** `node scripts/rebake_served_trek_bundle.mjs` → sha256 `b55a05c5d06af5b8de03235791d4a320457d7a264c1d2bafc4900f7893b78005` (unchanged this pass).

# PR #939 / #937 — expanded hero title unclip (vk carry)

| Path | Change |
| --- | --- |
| `public/ts-trip-hero-collapse.js` | Expanded `h1`: removed `white-space:nowrap`; use `overflow-wrap:anywhere` so full title is unclipped at 390. Kept CSS grid chevron column, slim collapsed bar, collapsed-only ellipsis. |
| `scripts/test_vacation_app_927_hero_collapse.mjs` | Dropped expanded one-line `clientHeight` and expanded height within 8px of ed8687b assertions. Kept zero overlap, collapsed ≤57px, collapsed one-line, `scrollWidth <= clientWidth` expanded, no expanded ellipsis. |

## Checks @ PATCH

| Command | Result |
| --- | --- |
| `node scripts/rebake_served_trek_bundle.mjs` | PASS (sha256 above) |
| `node scripts/test_served_trek_bundle.mjs` | PASS |
| `node scripts/test_issue_888_clipped_text.mjs` | PASS (390 DOM chip bounds) |
| `node scripts/test_vacation_app_927_hero_collapse.mjs` | PASS |
| `node scripts/test_issue_928_daybyday_arrival_conflicts.mjs` | PASS |
| `node scripts/test_ui_558_daybyday_time_name_baseline.mjs` | PASS |
| `cd apps/vacation-client && npm test` | PASS |
| `node scripts/check-no-comments.mjs` | PASS (1141 files) |
| `node scripts/test_offline_manifest.mjs` | PASS (444 offline, 19 online) |
| `BASE=vk node scripts/check-code-ratchet.mjs` | PASS (251 report, 0 fail) |

## Uncommitted for host

| Path | Note |
| --- | --- |
| `J/RECEIPT.md` | This file (merge resolved) |
| `public/ts-trip-hero-collapse.js` | #939 hero (vk merge stage) |
| `scripts/test_vacation_app_927_hero_collapse.mjs` | #939 hero test (vk merge stage) |

**Host:** `git add` resolved paths; `git commit --no-edit` (merge) or commit message for conflict round; push `vkfill/888-20261109142715`; CI; Gate B allow `888`.
