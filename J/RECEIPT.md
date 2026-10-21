# vkfill-549 round 2 (merge 7bc66068 + row 608 CI)

**Start sha:** `da8e61d95b5a739f082b9b2a9abe5452cea116fa`

## Step 1 — finish host-started merge

- Kept #549 `J/PR_DESCRIPTION.md` and `J/RECEIPT.md`.
- Took base `public/assets/index-BKun7ofk.js`, ran `node scripts/rebake_served_trek_bundle.mjs`.
- `git commit --no-edit` completes merge of `origin/migrate/trek-source` (`7bc66068`).

## Step 2 — CI `test_vk_search_place_output_contract` (row 608 price)

Round 1 fixture merge left list-only row 608 with `thingOverrides.place:608.price` after `finalizeServedSharedTripPayload` (ccab list-row merge). Base keeps row 608 price blocked on the override.

- **`scripts/fixtures/nyc-craig-kim-daybyday-trip.mjs`**: after finalize, delete `price` on place 608 and `thingOverrides['place:608']` only.

## Checks (local; host publish + CI authority)

| Command | Exit |
| --- | --- |
| `cd apps/vacation-client && npm test` | 0 |
| `node scripts/test_vk_search_place_output_contract.mjs` | 0 |
| `scripts/offline-tests.txt` lines 1–44 (`PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser`) | 0 |
| `scripts/offline-tests.txt` lines 45–`test_live_transcript_dialog_pdf.mjs` | 0 through `test_eval_jev_cards.mjs`; **stop** at `test_live_transcript_dialog_pdf.mjs`: `rules.via` `gbrain-cli-get_page` vs `bundled-get_page` (host env; same as #581 receipt) |
| `node scripts/check-no-comments.mjs` | 0 |
| `node scripts/test_offline_manifest.mjs` | 0 |
| `BASE=migrate/trek-source node scripts/check-code-ratchet.mjs` | 0 |
| `BASE=codex/ruling95-consolidated-logo node scripts/check-code-ratchet.mjs` | 0 |

**Tip sha:** `765c2b4c` (merge `c87f074e`, row 608 + ratchet `78c6766f`, receipt `765c2b4c`).

## Left alone

Tests/checkers, baselines, Gate B config, workflows, timeline hotel prices from #580.
