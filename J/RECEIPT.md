# vkfill-549 round (Gate B negative fixture row 608, 2026-11-02)

**Start sha:** `e8123736f026f7953322db039385ee0492b49afe` (PR #549 head at launch; ref `bot-admin/lanes/vk-pr-handoff/pr-549`)

## Root cause

CI `scripts/test_gate_b_product_row_fields.mjs:278` expected the PR340 negative fixture to **fail** `assessGateBNycFixtureContract` (profile `negative`), including a `608:` price violation. Stored-ccab finalization kept `thingOverrides['place:608'].price === 386` (required by `vk_search_place_source_contract_check.mjs:133`) but `applyLiveAppListRowFields` copied that rate onto `places[608].price` on the second `finalizeServedSharedTripPayload` pass, so `renderedPrice` returned 386 and the negative contract passed (`true !== false`).

## Changes (uncommitted)

- **`scripts/lib/gate-b-nyc-fixture-contract.mjs`**: `renderedPrice` returns `null` for `GATE_B_INCOMPLETE_LIST_ROW_IDS` (608) unless `trip.metadata.gateBNycFixtureVersion === gate-b-nyc-positive-v1`, matching list-only / incomplete-contract semantics while override price stays for VK search contract.
- **`src/vacation/shared-trip-live-app-fields.mjs`**: after ccab merge, delete `places[608].price` on non–positive-v1 trips so served list rows stay list-only without re-copying override price.

## Checks (local)

| Command | Result |
| --- | --- |
| `node scripts/test_gate_b_product_row_fields.mjs` | PASS (`e8123736` CI miss at :278 cleared) |
| `node scripts/test_vk_search_place_output_contract.mjs` | PASS |
| `node scripts/test_stored_ccab_canonical_identity.mjs` | PASS |
| `node scripts/test_list_row_description_substance.mjs` | PASS |
| `cd apps/vacation-client && CHROME_PATH=/usr/bin/google-chrome npm test` | PASS (includes `test/list-layout.mjs` Hotels / Manhattan Club ink) |
| `node scripts/check-no-comments.mjs` | PASS |
| `node scripts/test_offline_manifest.mjs` | PASS |
| `BASE=vk node scripts/check-code-ratchet.mjs` | PASS |

**Note:** `node scripts/run-offline-tests.mjs` stopped on env-only `scripts/test_live_transcript_dialog_pdf.mjs:651` (`gbrain-cli-get_page` vs `bundled-get_page` on this host); not PR #549 scope.

## Left alone

Baselines, fixtures, tests/asserts, Gate B config, workflows, evidence PNGs (reverted after local client test). No git commit in lane (HOST PUBLICATION ONLY).

**Host:** stage `scripts/lib/gate-b-nyc-fixture-contract.mjs`, `src/vacation/shared-trip-live-app-fields.mjs`, and this receipt; commit on `cursor/tsv-546-known-gap-on-migrate-trek-source-description-substance-and-quality-4c4d`, push once.
