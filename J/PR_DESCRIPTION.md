Closes #607

## Summary

- Host-merged `migrate/trek-source` at `6edb0791` into PR head `75cb1caa`; conflicts resolved toward base except #607 hotel list description derivation.
- Scope cut vs base tip: only `listTabModel.mjs` / `trip-thing-enrichment.mjs` (+ `listRows.unit.mjs`); removed out-of-scope trek Gate B patches, extra evidence PNGs, and `trek-gateb-list-budget-patches.mjs`; served bundle rebaked from base patches (matches base `public/assets/index-BKun7ofk.js`).

## Checks (local, tip `8100b20ed974dd01ff6eabca0735707c615dc1df`)

- `cd apps/vacation-client && CHROME_PATH=/usr/bin/chromium-browser npm test` — 0
- `node scripts/check-no-comments.mjs` — 0
- `node scripts/test_offline_manifest.mjs` — 0
- `BASE=migrate/trek-source node scripts/check-code-ratchet.mjs` — 0
- `BASE=codex/ruling95-consolidated-logo node scripts/check-code-ratchet.mjs` — 0

## Left alone (scope)

- Baselines, Gate B capture config, `scripts/offline-tests.txt`, workflows, `package.json`, deploy config.
- CI + Gate B on pushed head are authority for done (not self-certified).
