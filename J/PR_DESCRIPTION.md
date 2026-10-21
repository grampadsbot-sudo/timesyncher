Closes #589

## Summary

- Gate B structure failed on Events (and similar) list rows because capture could not record `first_text` for logo-vs-name centering: the name sat as a bare text node inside `[data-ts-list-row-name]`, not in a `span`/`strong` leaf.
- Patch `Oe()` so the default title branch wraps `ua` in `<strong>` (flight/car/hotel components unchanged). Rebake `public/assets/index-BKun7ofk.js`.

## Checks

- `node scripts/rebake_served_trek_bundle.mjs` — 0
- `node scripts/test_itinerary_fresh_daybyday_bundle.mjs` — 0
- `node scripts/test_served_trek_bundle.mjs` — 0
- Pre-DONE: `check-no-comments`, `test_offline_manifest`, `check-code-ratchet` (bases `migrate/trek-source` and `codex/ruling95-consolidated-logo`) — 0

## Left alone (scope)

- Capture/Gate B scripts, baselines, fixtures, and `scripts/offline-tests.txt` (no new test file; extended existing bundle test).
