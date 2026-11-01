# PR #773 / issue #471 — lane vkfill-773 receipt

**Start HEAD:** `4ec3250b7f07d494568ce8c255715eb530cd875c` (unchanged; host publishes)

## Root cause (Gate B on 4ec3250b)

`patchSharedTripListWrapping` set `whiteSpace:"normal"` on every `data-ts-list-row-name` span, including rows inside `data-ts-logo-name-pair`. Multi-line names vertically center the 28px chip against the full text block, so logo ink (nudged to the first name line) fails Gate B **logo not centred with name** on flights/hotels/restaurants/events/stores/cars captures. Price lines in the brief are data-only (ignored per Craig 10/20).

## Fix

Keep #471 Apple leaf alignment (`lineHeight:1`, `strong` block, ink → `tsListRowNameLeafCenterY`) but restore **single-line** list titles inside logo+name pairs (`nowrap` + ellipsis) so chip center and first name line stay aligned.

## Files touched

- `src/vacation/shared-trip-oe-list-row-patch.mjs` — `OE_LOGO_PAIR_LIST_ROW_NAME_*` rewind after wrap patch
- `public/assets/index-BKun7ofk.js` — rebaked (`node scripts/rebake_served_trek_bundle.mjs`, sha256 `dd89d02ba17d8ecf57060706c3925d1a600e07a24b5dd273800dd1912f3ee469`)
- `scripts/test_ui_471_apple_row_name_frame.mjs` — assert logo-pair bundle anchor
- `scripts/test_shared_tab_list_summary.mjs` — list row name `nowrap` under logo pair

## Checks (local, uncommitted tree)

| Command | Result |
| --- | --- |
| `node scripts/rebake_served_trek_bundle.mjs` | PASS |
| `node scripts/test_ui_471_apple_row_name_frame.mjs` | PASS |
| `node scripts/test_shared_tab_list_summary.mjs` | PASS |
| `node scripts/test_gate_b_row_name_frame.mjs` | PASS |
| `node scripts/test_thing_logo_ink_center.mjs` | PASS |
| `node scripts/test_gate_b_live_tab_logo_rows.mjs` | PASS |
| `node scripts/test_served_trek_bundle.mjs` | PASS |
| `node scripts/check-no-comments.mjs` | PASS |
| `node scripts/test_offline_manifest.mjs` | PASS |
| `BASE=vk node scripts/check-code-ratchet.mjs` | PASS |

Gate B pixel re-run on Ubuntu staging not executed in lane (host CI + `restore_check.py` on push).

## Scope left alone

Budget/flight/hotel/car **price** gaps on NYC fixture — data harness, not UI (brief + decisions-log #65/#773 handoff).
