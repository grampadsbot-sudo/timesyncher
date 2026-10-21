# VK issue #584 receipt (cursor-ubuntu vkfill-586 round)

**Start sha:** `18afc75a92005c55a57c8d1e82271c8d9acaab0e`

## Fix (prior commit 20bd781d)

Gate B `generic descriptions` on flights: served `rr()` dropped stored summaries over 20 words, so the JetBlue row had no `data-list-summary` line and capture treated the fare grid as the only text.

- `src/vacation/flight-list-row-summary.mjs` — shared clause picker (≥6 words) for long stored summaries
- `src/vacation/trek-thing-detail-fields-patch.mjs` — bundle `rr()` uses that picker; upgrades prior broken `rr` patch in baked assets
- `apps/vacation-client/src/lib/listTabModel.mjs` — import shared picker (vacation-client parity)

## This round (vkfill-586)

CI would fail `scripts/test_served_trek_bundle.mjs`: committed `public/assets/index-BKun7ofk.js` was stale vs `renderServedTrekBundle()` after the `rr()` patch landed in `trek-thing-detail-fields-patch.mjs`. Rebaked with `node scripts/rebake_served_trek_bundle.mjs` (sha256 `ac62d8a9b2198c738ddd1a5ff04d06ebc907ab55468cbcd6f0140ec71defbfb0`).

## Commands (exit codes)

| Command | Exit |
| --- | --- |
| `node apps/vacation-client/test/listRows.unit.mjs` | 0 |
| `node scripts/test_served_trek_bundle.mjs` | 0 |
| `node scripts/rebake_served_trek_bundle.mjs` | 0 |
| `node scripts/check-no-comments.mjs` | 0 |
| `node scripts/test_offline_manifest.mjs` | 0 |
| `BASE=migrate/trek-source node scripts/check-code-ratchet.mjs` | 0 |
| `BASE=codex/ruling95-consolidated-logo node scripts/check-code-ratchet.mjs` | 0 |

**Tip sha:** (filled after commit)
