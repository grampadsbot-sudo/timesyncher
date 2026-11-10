# PR #892 / #889 round 3 — street addresses + dossier overlay

**HEAD start:** `b8a06ba802e7d05a257c8ff6ea21011f99e1317a` (verified before edit)

**GBrain handoff:** `bot-admin/lanes/vk-pr-handoff/pr-892` — page_not_found on this pass (noted per lane brief).

## Changes (uncommitted; host publication only)

1. **`src/vacation/shared-trip-dossier-overlay.mjs`** — When a stored dossier has a supported, `addressIsSpecific` street address, it wins over neighborhood-only `thingOverrides` / fixture placeholders.
2. **`src/vacation/intake-shared-trip.mjs`** — `applyThingPresentation` no longer overwrites a specific override address with a non-specific trip-row address.
3. **Fixtures** — Street addresses for #889 addendum table in `gate-b-nyc-shared-staging.json`, `pr336-vk-search-places.snapshot.json`, and `nyc_ccab_place_enrichment.json`; flight rows in snapshot/staging use `AAA → BBB` routes instead of `Flight options / Bookings tab`.
4. **`scripts/test_dossier_evidence_hydrate_682.mjs`** — Overlay regression: Park Central dossier `870 7th Ave` beats `Midtown / Central Park South`.

## Checks run @ `b8a06ba8` + local patch

| Command | Result |
|---|---|
| `node scripts/test_dossier_evidence_hydrate_682.mjs` | pass |
| `node scripts/test_live_shared_gate_b_fill_regression_682.mjs` | pass (603 Belleclaire `2175 Broadway`) |
| `node scripts/test_thing_logo_fallback_758.mjs` | pass |
| `node scripts/test_gate_b_nyc_place_count_pin.mjs` | pass |
| Trip builder spot-check (`buildNycCraigKimDaybydayTrip`) | 627 `870 7th Ave…`, 680 `106 E 60th St…`, 693 `401 Bleecker St…` |

`node scripts/check-no-comments.mjs` — not run in `vkfill-892` worktree (missing `apps/vacation-client/node_modules/typescript`); host should run pre-DONE on full checkout.

## Host receipt path

Detailed diff list: `/home/ubishere9995/tsv-work/vkfill-889-20261109150135-job/vkfill-889-RECEIPT.md`

**DONE file:** `source-ready b8a06ba802e7d05a257c8ff6ea21011f99e1317a`

## Left alone (scope)

- Gate B pixel/screenshot capture, new offline test manifest rows, budget `people: 2` lines beyond existing fixture, Piccola hours garbage (needs live dossier `hours` field), duplicate Blue Note titles / pipeline title scrub, Zinc 404 logo hunt (snapshot logo URL already non-favicon).
