# #608 hotel list description DISPLAY — lane receipt (HOST PUBLICATION ONLY)

**Start HEAD:** `0a7e2c24994da840368916c61228bd1be711cfa3` (unchanged; patch uncommitted).

**Outcome:** `source-ready` — hotel list rows expose full stored `summary` as a capture-visible leaf (`data-ts-list-desc`) so Gate B `desc_box` can match; rebaked bundle sha256 `85ad5f78cf15b5f78522ed33e088b24a918aaaefeedf8fa22095e881ec4ebe82` on `public/assets/index-BKun7ofk.js` (6582436 bytes).

## Root cause + fix

Live `capture.mjs` picks the longest row `innerText` line as `desc` and requires a visible **leaf** whose text equals it. Hotel rows used `pick()` (120-char clip) for `rr()` while longer review lines (especially star markup in `data-ts-thing-review`) won “longest line” with no matching leaf → ~7/22 visible descriptions.

| Change | File |
| --- | --- |
| Hotel `rr()` returns full trimmed `ha(G).summary` (no 120-char pick) | `src/vacation/trek-ui-734-round2-patch.mjs` |
| Hotel list rows render full summary in `data-ts-list-desc="1"` leaf with `-webkit-line-clamp:3` (flights/cars/other rows unchanged) | `src/vacation/shared-trip-oe-list-row-patch.mjs` |
| Rebake served bundle | `public/assets/index-BKun7ofk.js` via `node scripts/rebake_served_trek_bundle.mjs` |

No fixture/data, Gate B harness, capture.mjs, or look_screen_rules edits. B1 stars + B5 reviews-once preserved.

## Capture-style counts (NYC 22 hotels, local rebaked bundle)

| Viewport | `desc_box` (capture leaf match) |
| --- | --- |
| 390 | 20/22 |
| 1280 | 20/22 |

(≥18/22 required by brief.)

## Uncommitted files

- `src/vacation/trek-ui-734-round2-patch.mjs`
- `src/vacation/shared-trip-oe-list-row-patch.mjs`
- `public/assets/index-BKun7ofk.js`
- `scripts/test_hotel_list_desc_capture_leaf.mjs` (new)
- `scripts/test_ui_734_round2_punchlist.mjs`
- `scripts/offline-tests.txt` (register new test; chief-dr brief)

## Tests (this lane @ start HEAD `0a7e2c24`)

| Command | Result |
| --- | --- |
| `node scripts/rebake_served_trek_bundle.mjs` | **PASS** |
| `node scripts/test_hotel_list_desc_capture_leaf.mjs` | **PASS** |
| `node scripts/test_ui_734_round1_punchlist.mjs` | **PASS** |
| `node scripts/test_ui_734_round2_punchlist.mjs` | **PASS** |
| `node scripts/test_ui_734_round2_shared_slug_chrome.mjs` | **PASS** |
| `node scripts/test_hotel_itinerary_note_timeline_731.mjs` | **PASS** |
| `node scripts/check-no-comments.mjs` | **PASS** |
| `node scripts/test_offline_manifest.mjs` | **PASS** |
| `BASE=vk node scripts/check-code-ratchet.mjs` | **PASS** |

Not done here: git commit/push, live staging `live_accept.py`, Gate B pixel (host).
