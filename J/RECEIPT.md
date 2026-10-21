# VK fill #549 receipt (cursor-ubuntu, 2026-10-21)

## Outcome

Merged **`origin/migrate/trek-source`** into PR #549 head (`acd11e52`, parents `6f1e1fe7` + `218a3b39`). Gate B fixture replay now runs **`finalizeServedSharedTripPayload`** via `src/vacation/shared-trip-fixture-replay.mjs` (shared-trip handler for `gateb-fixture-replay` + capture `timeline-replay.mjs`). Row **611** (Blue Note Jazz Club display) carries trek **`ccabKey` / `externalId`** `Blue Note Jazz Club` from `NYC_GATE_B_ROW_CCAB_KEYS` through `bindPr336GateBCanonicalIdentity`.

## What changed

- `src/vacation/shared-trip-fixture-replay.mjs`, `shared-trip-handler.mjs`: fixture replay serve path finalizes like live.
- `scripts/fixtures/pr336-vk-search-trip-sources.mjs`: `bindPr336GateBCanonicalIdentity`; row 611 ccab key `Blue Note Jazz Club`.
- `scripts/fixtures/nyc-craig-kim-daybyday-trip.mjs`: bind canonical identity on fixture places.
- `scripts/test_stored_ccab_canonical_identity.mjs`: live vs fixture-replay Blue Note description parity.
- Merge kept **#572** `listTabModel` flight summary clip + **#549** `listRowSubstanceDescription` / stored-ccab merge.

## Root cause (earlier Gate B thin rows)

Gate B capture replayed raw NYC fixture JSON without **`finalizeServedSharedTripPayload`**, so stored-ccab narrative merge never ran for replayed trips. Blue Note row **611** lacked trek **`externalId` / `ccabKey`**, so title-only alias rows stayed time+price thin. Fixed in **`6f1e1fe7`** + base sync **`acd11e52`** (managing-dr diagnostic scope 2026-10-20).

## Checks (local tip `98c50958`)

| Command | Exit |
| --- | --- |
| `node scripts/test_stored_ccab_canonical_identity.mjs` | 0 |
| `node scripts/test_list_row_description_substance.mjs` | 0 |
| `node scripts/test_gate_b_product_row_fields.mjs` | 0 |
| `apps/vacation-client` `npm run typecheck` + `node test/listRows.unit.mjs` | 0 |
| `node scripts/check-no-comments.mjs` | 0 |
| `node scripts/test_offline_manifest.mjs` | 0 |
| `BASE=migrate/trek-source node scripts/check-code-ratchet.mjs` | 0 |
| `BASE=codex/ruling95-consolidated-logo node scripts/check-code-ratchet.mjs` | 0 |

## Not self-certified

Ubuntu Gate B structure mode on pushed PR head and CI (`bot-admin/lanes/vk-pr-handoff/pr-549`). Issue **#575** `other` judgments triaged separately from description substance.
