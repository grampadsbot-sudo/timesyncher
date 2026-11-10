# #901 — trip 99 stand-in bundle Things → single venues

**Outcome:** source-ready PATCH (uncommitted; host publication). **Start HEAD:** `968c7ac8b01fda265bd4d2e265ab7115883191ea`.

## Changes

| id | was | now |
| --- | --- | --- |
| 664 | Guided walking/audio history tours (neighborhood address) | **Big Apple Greeter**, 1 Centre Street, New York, NY 10007 |
| 669 | Village Vanguard / Smoke / Birdland / Jazz Gallery (bundle title) | **Birdland Jazz Club**, 315 W 44th St, New York, NY 10036 |
| 672 | e’s BAR / The Dead Poet / Lilly’s Cocktail & Wine (bundle title) | **e’s BAR**, 511 Amsterdam Ave, New York, NY 10024 |

Data source: VK Search dossiers under `scripts/fixtures/vk-search-census/results/{664,669,672}.json`; Big Apple Greeter street address from official site metadata on `https://www.bigapplegreeter.org/` (`One Center Street` → 1 Centre Street).

### Files

- `scripts/fixtures/pr336-vk-search-places.snapshot.json`
- `scripts/fixtures/gate-b-nyc-shared-staging.json`
- `src/vacation/trip99-thing-standin-check.mjs` (bundle/generic title + targeted address guard)
- `scripts/ops/capture/capture-pre-data-check.mjs` (wires stand-in scan into Gate B pre-data)
- `scripts/test_issue_901_trip99_single_venue_standins.mjs`
- `J/trip99-backup.sql`, `J/trip99-change.sql`, `J/REVERT.md` (Neon; host applies)

## Checks (this lane)

| Check | Result |
| --- | --- |
| `node scripts/test_issue_901_trip99_single_venue_standins.mjs` | PASS |
| `node scripts/test_gate_b_capture_pre_data_check.mjs` | PASS |
| `node scripts/check-no-comments.mjs` | PASS |
| `node scripts/test_offline_manifest.mjs` | PASS |
| `BASE=codex/ruling95-consolidated-logo node scripts/check-code-ratchet.mjs` | PASS (round 2: dropped unused exports in `trip99-thing-standin-check.mjs`) |

### Pre-DONE gatefix round 2 (2026-11-10)

- `scripts/offline-tests.txt`: added `scripts/test_issue_901_trip99_single_venue_standins.mjs`
- `src/vacation/trip99-thing-standin-check.mjs`: `THING_TITLE_SLASH_ALLOWLIST_IDS`, `thingTitleSlashSegments`, `TRIP99_STANDIN_ADDRESS_PLACE_IDS` are module-private (still used internally; removes DEAD-CODE ratchet fails)

## Host publish

1. `git add` changed paths above (includes `scripts/offline-tests.txt`).
2. Apply `J/trip99-change.sql` on Neon with timestamped backup from `J/trip99-backup.sql`.
3. Commit; open PR into `vk` with `Closes #901`; push once; CI + Gate B on head.

## Left alone (scope)

Other trip 99 bundle rows (665, 667, …), `nyc-screen-trip99-live-shared-api.json`, `nyc_ccab_place_enrichment.json`, hotel neighborhood addresses (#889).
