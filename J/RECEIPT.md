# vkfill-550 receipt (2026-10-21)

## Outcome

Gate B hard round (tier 1): compact `Oe()` rows (events/restaurants/stores) now render as `li[data-list-row]` so capture records rows; name + `data-list-summary` flex shares width with `flex:1 1 0`; car header is inline-flex (no 3-col grid overflow); expanded row grid clips horizontally. Craig #547 same-line ellipsis preserved (#592 strong names).

Base merge: `origin/migrate/trek-source` at **e3364ac5** (host merge into 4163fee7).

## Tip sha

**eb232a48**

## Checks (local)

- `node scripts/rebake_served_trek_bundle.mjs`
- `cd apps/vacation-client && npm test`
- `node scripts/test_shared_tab_list_summary.mjs`
- `node scripts/test_served_trek_bundle.mjs`
- `node scripts/test_gate_b_live_tab_logo_rows.mjs`
- Pre-DONE: `check-no-comments`, `test_offline_manifest`, `BASE=migrate/trek-source check-code-ratchet`

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
