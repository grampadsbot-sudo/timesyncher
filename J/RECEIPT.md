# vkfill-550 receipt (2026-10-21)

## Outcome

Dirty-head base merge: resolved `J/RECEIPT.md` conflict; kept #550 row-layout + took `migrate/trek-source` served bundle at **58f5be59**, rebaked (`ffe2c859`). Inherited base #598 vacation-client 390px flight-row wrap (`DayMap.tsx`, `styles.css`, `test_vacation_client_list_row_390_text_wrap.mjs`). #547 list-row look unchanged from **5d9c4eb7**.

Base merge: `origin/migrate/trek-source` at **58f5be59** (host dirty-head merge into **5d9c4eb7**, 2026-10-21). Merge tip **d8635906**.

## Tip sha

**586d5fed**

## Checks (local)

| Command | Exit |
| --- | --- |
| `node scripts/rebake_served_trek_bundle.mjs` | 0 |
| `cd apps/vacation-client && npm test` | 0 (layout shell skipped: no CHROME_PATH) |
| `node scripts/test_shared_tab_list_summary.mjs` | 0 |
| `node scripts/test_served_trek_bundle.mjs` | 0 |
| `node scripts/test_gate_b_live_tab_logo_rows.mjs` | 0 |
| `node scripts/test_itinerary_fresh_daybyday_bundle.mjs` | 0 |
| `node scripts/test_vacation_client_list_row_390_text_wrap.mjs` | 0 |
| Pre-DONE gates | 0 |
| `scripts/offline-tests.txt` full loop | **fail** `test_day_by_day_map_marker_bounds_chrome.mjs` — Browser not found at `/usr/bin/google-chrome-stable` |

## Gate B / look (authority)

- Prior heads failed `overflow-390` (clipped summaries) and compact-tab `events list empty` / `rows: none` (div rows without `data-list-row`). Re-capture on new head is authority.
- Description substance (#549), prices (#580), NYC fixture look gaps (#598) unchanged.

## Host-only offline stops

- `apps/vacation-client` `npm test` — exit 1: `layout acceptance unavailable` (no CHROME_PATH / google-chrome).
- `scripts/test_day_by_day_map_marker_bounds_chrome.mjs` — Browser not found at `/usr/bin/google-chrome-stable`.
- `scripts/test_live_transcript_dialog_pdf.mjs:651` — `rules.via` = `gbrain-cli-get_page` (CI uses bundled rules).
- `scripts/test_same_selection_capture.mjs` / `scripts/test_capture_fixture_replay_harness.mjs` — stale `capture-producer-roots` worktree registration under `~/tsv-dispatch/pr-src`.

## CI

Host publishes; CI green on pushed head is authority.
