# PR #632 / issue #631 — cursor-ubuntu pass (2026-10-22)

**Start sha:** `bb8be14dc9a34ac54148f804136f4f34f89a68e5`

## Changes (host verdict 6349028367 follow-up)

- Aligned `scripts/test_dossier_refresh_integration.mjs` with claims-based dossier fixtures; mock `judgeImpl` / `extractReviewsImpl` so offline runs need no `XAI_PLACE_SEARCH_MODEL`.
- Removed comment violations across dossier modules (repo no-comment gate); reworded builder prompt (`must say` → `should state`).
- `dossier-cost.mjs`: lazy place-search rate lookup (no bare model literal at module load); ratchet-clean.
- `dossier-brave.mjs`: Brave API root from `poi-search.mjs` (`BRAVE_SEARCH_RES_V1`); `placeCoords` no longer exported dead.
- `thing-evidence-dossier.mjs`: dossier gather helpers kept module-private for DEAD-CODE ratchet.
- Registered `scripts/test_dossier_round5.mjs` in `scripts/offline-tests.txt`.

## Pre-DONE gates (local)

| Command | Result |
| --- | --- |
| `node scripts/test_thing_evidence_dossier.mjs` | pass |
| `node scripts/test_dossier_refresh_integration.mjs` | pass |
| `node scripts/test_dossier_round5.mjs` | pass |
| `node scripts/test_check_hardcoded_content.mjs` | pass |
| `node scripts/check-no-comments.mjs` | pass |
| `node scripts/test_offline_manifest.mjs` | pass |
| `BASE=codex/ruling95-consolidated-logo node scripts/check-code-ratchet.mjs` | pass (0 fail) |

## Not claimed

- Green CI on pushed head, Gate B 32/32, staging dossier batch with live keys, or `live_accept` — host publish + acceptance only.
