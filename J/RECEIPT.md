# vkfill-550 receipt (2026-10-21)

## Outcome

Gate B hard round (tier 1): compact `Oe()` rows (events/restaurants/stores) now render as `li[data-list-row]` so capture records rows; name + `data-list-summary` flex shares width with `flex:1 1 0`; car header is inline-flex (no 3-col grid overflow); expanded row grid clips horizontally. Craig #547 same-line ellipsis preserved (#592 strong names).

## Tip sha

**d3d3fddc**

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

- `scripts/test_live_transcript_dialog_pdf.mjs:651` — `rules.via` = `gbrain-cli-get_page` (CI uses bundled rules).
- Map marker bounds offline test — no CHROME_PATH on this host.

## CI

Host publishes; CI green on pushed head is authority.
