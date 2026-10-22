Closes #607

## Summary

- Host-merged `migrate/trek-source` at `6edb0791` into PR head `75cb1caa`; conflicts resolved toward base except #607 hotel list description derivation.
- Scope cut: PR diff vs base tip is hotel list copy from long Booking-style fields in `listTabModel.mjs` / `trip-thing-enrichment.mjs` (+ unit test) and rebaked `public/assets/index-BKun7ofk.js` only; flights/restaurants/events/budget trek patches and evidence PNGs restored to base.

## Checks (local)

- `cd apps/vacation-client && CHROME_PATH=/usr/bin/chromium-browser npm test` — pending this round
- Pre-DONE: `node scripts/check-no-comments.mjs`, `node scripts/test_offline_manifest.mjs`, `BASE=migrate/trek-source node scripts/check-code-ratchet.mjs`

## Left alone (scope)

- Baselines, Gate B capture config, `scripts/offline-tests.txt`, workflows, `package.json`, deploy config.
- CI + Gate B on pushed head are authority for done (not self-certified).
