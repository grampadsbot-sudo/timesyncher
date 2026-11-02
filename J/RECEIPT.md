# vkfill-549 round (row 608 sourced price + CI contract, 2026-11-02)

**Start sha:** `64dc1bc4b5909869f1330fb47d1abc57b080a767`

## Root cause

CI `scripts/test_vk_search_place_output_contract.mjs` → `vk_search_place_source_contract_check.mjs:133` expected `thingOverrides['place:608'].price === 386` (PR336 sourced nightly rate). `buildNycCraigKimDaybydayTrip()` still deleted that override price after `finalizeServedSharedTripPayload` while only the served `places[]` row should stay list-only without a display price.

## Changes (uncommitted)

- **`scripts/fixtures/nyc-craig-kim-daybyday-trip.mjs`**: stop deleting `thingOverrides['place:608'].price`; keep deleting `places[608].price` so list UI / incomplete-contract behavior unchanged.

## Checks (local)

| Command | Result |
| --- | --- |
| `node scripts/vk_search_place_source_contract_check.mjs` | PASS |
| `node scripts/test_vk_search_place_output_contract.mjs` | PASS |
| `cd apps/vacation-client && CHROME_PATH=/usr/bin/google-chrome npm test` | PASS (includes `list-layout.mjs`) |
| `node scripts/check-no-comments.mjs` | PASS |
| `node scripts/test_offline_manifest.mjs` | PASS |
| `BASE=migrate/trek-source node scripts/check-code-ratchet.mjs` | PASS |

**Note:** full `scripts/offline-tests.txt` loop hit env-only fail in `scripts/test_live_transcript_dialog_pdf.mjs:651` (`gbrain-cli-get_page` vs `bundled-get_page` on this host); not PR #549 scope.

## Left alone

Baselines, Gate B config, workflows, tests/asserts, trek bundle rebake, evidence PNGs (reverted after local client test run). No git commit in lane (HOST PUBLICATION ONLY).

**Host:** stage only `scripts/fixtures/nyc-craig-kim-daybyday-trip.mjs` + this receipt, commit on `cursor/tsv-546-known-gap-on-migrate-trek-source-description-substance-and-quality-4c4d`, push once.
