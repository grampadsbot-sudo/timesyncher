Closes #547

## What changed

Craig #547 (comment 6319246079): list-row descriptions on the **same line** as the name (ellipsis-truncated) at **every** width including 390px.

**Head 4b19cbd4**: list-row title buttons no longer use `whiteSpace:nowrap` on the outer control, so the inner flex row (`data-ts-list-row-name` + `data-list-summary`) can shrink with intended CSS ellipsis inside the 390px grid column. Hotel `je()` stays inline-flex with #592 `<strong>` names.

1. **`src/vacation/shared-trip-oe-list-row-patch.mjs`**: flex/maxWidth on inline summary row; title button `display:block` + `maxWidth:"100%"` (ellipsis on inner spans).
2. **`src/vacation/trek-live-product-patches.mjs`**: same title-button overflow fix on car list rows.
3. **`public/assets/index-BKun7ofk.js`**: rebaked via `node scripts/rebake_served_trek_bundle.mjs`.
4. **`scripts/test_shared_tab_list_summary.mjs`**: asserts new flex/button overflow contract.

## Verification (local)

| Command | Result |
|---|---|
| `node scripts/rebake_served_trek_bundle.mjs` | OK — sha256 `e793d1064d21a395a13cb7e99ae4cf39dfbebf1d2e4f4cfcbf10bd7aacbf404c` |
| `node scripts/test_shared_tab_list_summary.mjs` | pass |
| `node scripts/test_served_trek_bundle.mjs` | pass |
| `node scripts/test_itinerary_fresh_daybyday_bundle.mjs` | pass |
| `node scripts/test_gate_b_live_tab_logo_rows.mjs` | pass |
| `CHROME_PATH=/usr/bin/chromium-browser node scripts/test_shared_trip_no_horizontal_overflow.mjs` | pass |
| `cd apps/vacation-client && npm test` | pass (layout chrome skipped: no CHROME_PATH in npm test) |
| Pre-DONE: `check-no-comments`, `test_offline_manifest`, `BASE=migrate/trek-source check-code-ratchet` | pass |

Gate B structure + CI on pushed **4b19cbd4** are authority (host cron).

## Scope / left alone

- Description **substance** (#549), prices (#580), timeline/budget parity, baselines, Gate B config, fixtures, workflows, dependencies.
- Keepsake HTML list rows unchanged.
