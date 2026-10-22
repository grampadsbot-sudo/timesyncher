Closes #613

## Problem

Live accept at 390px reported hotel list titles ~68px past the right edge on `/shared/` (served `Oe()` bundle). Round 0 added mobile **wrap** CSS; Gate B failed `hotels-390` / `hotels-390-top` pixel compare and conflicts with #547 (name and description stay one ellipsis-truncated line at every width).

## Fix

1. Keep `data-ts-hotel-row-head` and `minmax(0,1fr) auto` hotel title+price grid in `shared-trip-oe-list-row-patch.mjs`; add block ellipsis on the title `<strong>`.
2. Replace `@media (max-width:480px)` Hotels rules in `public/assets/index-CbEHlMj6.css` with **truncation** (`nowrap` + `text-overflow:ellipsis`, grid `min-width:0`) — no `white-space:normal` / `overflow-wrap`.
3. `[data-ts-list-row-name]` gets `width:100%` / `maxWidth:100%` via `trek-live-product-patches.mjs`.
4. Offline contract `scripts/test_shared_hotels_390_text_wrap.mjs` updated for truncation (registered in `scripts/offline-tests.txt`).

## Checks run (local)

| Command | Result |
| --- | --- |
| `node scripts/rebake_served_trek_bundle.mjs` | 0 |
| `node scripts/test_shared_hotels_390_text_wrap.mjs` | 0 |
| `node scripts/test_served_trek_bundle.mjs` | 0 |
| `node scripts/test_itinerary_fresh_daybyday_bundle.mjs` | 0 |
| Pre-DONE: `check-no-comments`, `test_offline_manifest`, `check-code-ratchet` (`migrate/trek-source`, `codex/ruling95-consolidated-logo`) | 0 |

**Not run locally:** Gate B pixel compare, live `live_accept.py`.

**Authority:** CI green on published PR head + Gate B PASS on all 32 screens.

## Left alone

- `apps/vacation-client` mobile wrap rules (#596 path).
- Fixture price/description gaps named in chief-dr brief (data/harness; not patched in this layout round).
