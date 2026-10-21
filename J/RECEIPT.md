# vkfill-549 round 3 (dirty-head merge 446e1913)

**Start sha:** `871968b943cf2f8831aa659a7badaf4da8276c7d`

## Host-started base merge

- Kept #549 `J/PR_DESCRIPTION.md` and `J/RECEIPT.md` (this file); noted base merge includes #589 `Oe()` default title `<strong>` wrap in `shared-trip-oe-list-row-patch.mjs`.
- Took base `public/assets/index-BKun7ofk.js`, ran `node scripts/rebake_served_trek_bundle.mjs` (sha256 `fd3fbf97…`).
- Resolved `scripts/test_itinerary_fresh_daybyday_bundle.mjs`: assert both `<strong>` wrap and `Rn=Bs(tsListRowDescription(G))` after rebake.
- `git commit --no-edit` completes merge of `origin/migrate/trek-source` (`446e19137ebe9c6ee0dab651dca078f2cd35f13f`).

## Prior round (context)

Round 2 on `da8e61d9`: row 608 `price` strip on list-only hotel; merge `7bc66068`.

## Checks (local; host publish + CI authority)

| Command | Exit |
| --- | --- |
| `CHROME_PATH=/usr/bin/chromium-browser cd apps/vacation-client && npm test` | 0 |
| `scripts/offline-tests.txt` lines 1–85 (`PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser`) | 0 |
| `scripts/offline-tests.txt` line 86 `test_live_transcript_dialog_pdf.mjs` | **1** — `rules.via` `gbrain-cli-get_page` vs `bundled-get_page` (lane has `~/.local/bin/gbrain`; CI has no CLI). With `PATH` sans gbrain: `pdftotext` missing (`layout.status` null). Host/CI env; not changed in this round. |
| `scripts/offline-tests.txt` lines 87–162 | 0 |
| `scripts/offline-tests.txt` lines 163–end (`PATH` with job-dir `google-chrome` → chromium shim) | 0 |
| `node scripts/test_vk_search_place_output_contract.mjs` | 0 |
| `node scripts/test_list_row_description_substance.mjs` | 0 |
| `node scripts/check-no-comments.mjs` | 0 |
| `node scripts/test_offline_manifest.mjs` | 0 |
| `BASE=migrate/trek-source node scripts/check-code-ratchet.mjs` | 0 |
| `BASE=codex/ruling95-consolidated-logo node scripts/check-code-ratchet.mjs` | 0 |

**Tip sha:** `ac6b586e`

## Left alone

Tests/checkers (except conflict resolution in bundle test), baselines, Gate B config, workflows, timeline hotel prices from #580, evidence PNGs from local layout runs (not staged).
