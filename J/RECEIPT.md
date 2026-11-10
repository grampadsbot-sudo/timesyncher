# PR #896 / issue #888 — host vk merge @ `59ee8ec9`

**Outcome:** SOURCE-READY (uncommitted; HOST PUBLICATION ONLY). **Starting HEAD:** `59ee8ec976f20d6ad4c63bcd8f87df1e570d957c`. **Merged base:** `1fc2ef7708aeed7a318b11b9fb3fef518f1b4044` (`origin/vk`). **Model:** composer-2.5.

## Problem restatement (#888)

At 390px, shared-trip flight list cards keep depart and arrive time chips on one horizontal row with non-shrinking `min-width: max-content` chips (`ISSUE_888_SERVED_LAYOUT_CSS` / `[data-ts-flight-time="1"]` in `src/vacation/shared-trip-oe-list-row-patch.mjs`; vacation-client `.tsv-row-flight-time` and `.tsv-row-flight-main` grid in `apps/vacation-client/src/styles.css` @media max-width 480px). Full arrival strings extend past the card’s right padding, clipping text and the card border while logos and day-by-day conflict wrap remain correct.

## Product fix (preserved through vk merge)

- **Served rows:** `ISSUE_888_SERVED_LAYOUT_CSS` — two-row CSS grid for `[data-ts-flight-row-grid="1"]` at ≤480px; times on row 2; logo/name column spans rows; `SHARED_LIVE_FLIGHT_LOGO_NAME_CSS` for chip alignment.
- **Vacation client:** `.tsv-row-flight-main` @390 — logo row 1 col 1; title stack cols 2–4; price col 4; depart/arrive row 2 cols 3–4.
- **#928 carry:** `applyFlightDayTimelinePatches` conflict loop + wrapped `data-ts-conflict-label`; vacation-client `.tsv-timeline-conflict` wrap + `overflow-wrap: anywhere`.
- **Rebake:** `public/assets/index-BKun7ofk.js` took merge stage-3 (vk), then `node scripts/rebake_served_trek_bundle.mjs` → sha256 `b55a05c5d06af5b8de03235791d4a320457d7a264c1d2bafc4900f7893b78005`.

## Conflict resolution

| Path | Resolution |
| --- | --- |
| `public/assets/index-BKun7ofk.js` | vk stage-3 + rebake (above) |
| `apps/vacation-client/src/styles.css` | #888 timeline conflict wrap + vk `line-height` / `word-break` |
| `src/vacation/trek-live-product-patches.mjs` | vk conflict card `width:"100%"` + #888 `CONFLICT_LABEL_PATCH` apply |
| `src/vacation/trek-live-product-flight-day-patches.mjs` | Narrow rebake guard (nowrap on conflict label only, not car rows) |
| `J/RECEIPT.md` | This file |

## Checks @ PATCH

| Command | Result |
| --- | --- |
| `node scripts/rebake_served_trek_bundle.mjs` | PASS (sha256 above) |
| `node scripts/test_served_trek_bundle.mjs` | PASS |
| `node scripts/test_issue_888_clipped_text.mjs` | PASS (390 DOM chip bounds) |
| `node scripts/test_issue_928_daybyday_arrival_conflicts.mjs` | PASS |
| `node scripts/test_ui_558_daybyday_time_name_baseline.mjs` | PASS |
| `cd apps/vacation-client && npm test` | PASS |
| `node scripts/check-no-comments.mjs` | PASS (1141 files) |
| `node scripts/test_offline_manifest.mjs` | PASS (444 offline, 19 online) |
| `BASE=vk node scripts/check-code-ratchet.mjs` | PASS (251 report, 0 fail) |

**Host:** `git add` resolved `UU` paths + rebaked bundle + `trek-live-product-flight-day-patches.mjs`; `git commit --no-edit`; push `vkfill/888-20261109142715`; CI; Gate B allow `888`.
