# PR #632 / issue #631 — cursor-ubuntu correction pass (2026-10-22)

**Start sha:** `6e191085bb13ad42df77c1398a24611314949c9c`

## Host gaps addressed (comment 6349028367 / manager-pass brief)

- `computeDossierFieldHashes` now tracks `reviews` against saved review-page SHA bundles (comma-separated sources when needed).
- `fetchXaiPlaceRatings` re-gathers pages, uses `changedDossierPageUrls` + `dossierRebuildFields`, skips the builder when hashes are fresh, runs max-age full refresh, and `mergeSelectiveDossierFindings` keeps unaffected fields byte-identical on partial page changes.
- Persisted dossiers use one store abstraction (`thing-evidence-dossier-store.mjs`); `applyStoredDossiersToSharedTrip` loads via `loadDossiersByKeys` (same store as save). `intakeSharedResponse` applies dossiers before serve. Gate B fixture reads the same local store path via `loadNycDaybydayDossiersFromDisk`.
- Staging batch: `src/vacation/thing-evidence-dossier-execution.mjs` + `scripts/build_nyc_thing_evidence_dossiers.mjs`; worker-auth POST `api/thing-evidence-dossiers` (registered in `api/[...route].mjs`).
- BAR-THING-CUSTOMER: dossier builder prompt uses “this place” (not “this exact Thing”).

## Tests run locally (starting tree + deps)

| Command | Result |
| --- | --- |
| `node scripts/test_thing_evidence_dossier.mjs` | pass |
| `node scripts/test_dossier_refresh_integration.mjs` | pass |
| `node scripts/test_vk_search_place_output_contract.mjs` | pass |
| `node scripts/test_check_hardcoded_content.mjs` | pass |
| `node scripts/check-no-comments.mjs` | pass (840 files) |
| `node scripts/test_offline_manifest.mjs` | pass (287 offline) |
| `BASE=migrate/trek-source node scripts/check-code-ratchet.mjs` | pass (0 fail) |

## Not claimed

- Green CI on pushed head, Gate B 32/32, staging `build_nyc_thing_evidence_dossiers.mjs` with live keys, or `live_accept` — host publish + acceptance only.
