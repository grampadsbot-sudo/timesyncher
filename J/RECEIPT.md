# VK issue #584 receipt (cursor-ubuntu vkfill/584-20261021095726)

**Start sha:** `adf7d28977781e1b58a44f34ea2c47c508fcf698`

## Fix

Gate B `generic descriptions` on flights: served `rr()` dropped stored summaries over 20 words, so the JetBlue row had no `data-list-summary` line and capture treated the fare grid as the only text.

- `src/vacation/flight-list-row-summary.mjs` — shared clause picker (≥6 words) for long stored summaries
- `src/vacation/trek-thing-detail-fields-patch.mjs` — bundle `rr()` uses that picker; upgrades prior broken `rr` patch in baked assets
- `apps/vacation-client/src/lib/listTabModel.mjs` — import shared picker (vacation-client parity)

## Commands (exit codes)

| Command | Exit |
| --- | --- |
| `node apps/vacation-client/test/listRows.unit.mjs` | 0 |
| `node scripts/check-no-comments.mjs` | (pre-DONE) |
| `node scripts/test_offline_manifest.mjs` | (pre-DONE) |
| `BASE=migrate/trek-source node scripts/check-code-ratchet.mjs` | (pre-DONE) |
| `BASE=codex/ruling95-consolidated-logo node scripts/check-code-ratchet.mjs` | (pre-DONE) |

**Tip sha:** (filled after commit)
