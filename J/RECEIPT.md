# VK PR #590 / issue #588 receipt (cursor-ubuntu vkfill-590 BASE-MERGE)

**Branch:** `vkfill/588-20261021125728`  
**Start head:** `6e029f24ddc3314c2f62f7af97774944af557a6d`  
**Tip head:** `ce70be64`  
**Authority:** GBrain `bot-admin/lanes/vk-pr-handoff/pr-590` + chief-dr dirty-head merge brief

## Base merge

Host merged `origin/migrate/trek-source` at `446e19137ebe9c6ee0dab651dca078f2cd35f13f` into `bf232ddd`. Conflicts resolved in `J/` only; took base `public/assets/index-BKun7ofk.js` then `node scripts/rebake_served_trek_bundle.mjs`; kept base `src/vacation/shared-trip-oe-list-row-patch.mjs` (`<strong>` default list-row title for Gate B `first_text`).

Second dirty-head merge: merged `origin/migrate/trek-source` at `e3364ac5b3d44795cd3b2d9c857e9c940a9f6790` into `6e029f24` (PR #600 / #597 Gate B NYC fixture on base). Conflicts resolved in `J/RECEIPT.md` only; `node scripts/rebake_served_trek_bundle.mjs` (no served bundle diff).

## Change (PR #588)

- `src/vacation/shared-trip-fixture-replay.mjs`: served `places` shape unchanged on replay (CI fix for `test_same_selection_capture.py`).
- `apps/vacation-client/src/lib/listTabModel.mjs`: generic list logos at render time via `resolveThingLogoUrl`.

## Local verification

| Command | Result |
| --- | --- |
| `python3 scripts/ops/dispatch/test_same_selection_capture.py` | OK (11 tests) |
| `cd apps/vacation-client && npm test` | OK (layout shell skipped without CHROME_PATH) |
| `node scripts/rebake_served_trek_bundle.mjs` | OK |
| `node scripts/check-no-comments.mjs` | pass |
| `node scripts/test_offline_manifest.mjs` | pass |
| `BASE=migrate/trek-source node scripts/check-code-ratchet.mjs` | pass |
| `BASE=codex/ruling95-consolidated-logo node scripts/check-code-ratchet.mjs` | pass |
| `node scripts/run-offline-tests.mjs` | FAIL lane host: `test_day_by_day_map_marker_bounds_chrome.mjs` hardcodes `/usr/bin/google-chrome-stable` (missing on Ubuntu lane; not PR diff) |

## Verdict

Base-merge tip `ce70be64` (merge `27c0ea8a` + J) ready for host push; CI `unit-tests` + Gate B on pushed head are merge authority.

## Round vkfill-590 @ c364a0cd (2026-11-02, HOST PUBLICATION ONLY)

**Root cause:** Served list chips use TREK `_l(G)` (`Re.logoUrl || G.logoUrl || oi(cc(G))`). Shared placeholder SVGs stayed on `place.logoUrl` when `thingOverrides.logoUrl` was cleared and no resolved favicon was written, so many event/hotel rows shared one `G.logoUrl` (Gate B #588 generic logos).

**Patch (uncommitted, host push):**
- `src/vacation/shared-trip-live-app-fields.mjs`: drop placeholder `logoUrl`/`iconUrl` from place + override when resolve fails so `_l` can fall through to `oi(cc(G))`.
- `src/vacation/thing-logo-capture.mjs`: do not persist placeholder `image_url` as `place.logoUrl` in `applyCapturedLogos`.

**Checks @ c364a0cd base + patch:**
| Command | Result |
| --- | --- |
| `cd apps/vacation-client && npm test` | pass |
| `node scripts/test_gate_b_live_tab_logo_rows.mjs` | pass |
| `node scripts/test_trip_thing_logo_metadata.mjs` | pass |
| `node scripts/test_shared_trip_live_tab_logos.mjs` | pass |
| `node scripts/check-no-comments.mjs` | pass |
| `node scripts/test_offline_manifest.mjs` | pass |
| `BASE=migrate/trek-source node scripts/check-code-ratchet.mjs` | pass |

Gate B closed-gap on staging not run in lane (no Cursor self-proof). Host: commit → push → Gate B structure on events/hotels 390+1280.

## Round vkfill-590 @ 2afbe696 (2026-11-02 lane, HOST PUBLICATION ONLY)

**Root cause:** Gate B capture serves fixture replay payload where TREK `_l(G)` reads `ha(G).logoUrl` before `G.logoUrl`. Replay only normalized timeline flags; empty or placeholder overrides left rows on shared fallbacks (and OSM `favicon.ico` clusters). Live API already ran `finalizeServedSharedTripPayload`; replay did not.

**Patch (uncommitted, host push @ 2afbe696):**
- `src/vacation/shared-trip-live-app-fields.mjs`: `applyServedListLogoOverridesOnly` + shared `applyListRowLogoFields` (override-only logo/url for replay; same logic for live mutate path).
- `src/vacation/shared-trip-fixture-replay.mjs`: after timeline normalize, apply override-only logo enrichment; `places` array identity preserved for `test_same_selection_capture.py`.
- `src/vacation/thing-logo-capture.mjs`: treat OpenStreetMap page URLs as non-logo sources; block OSM favicon as generic placeholder.
- `src/vacation/keepsake-product-overrides.mjs`: do not copy placeholder logos into overrides.

**Checks @ 2afbe696 + patch:**
| Command | Result |
| --- | --- |
| `cd apps/vacation-client && npm test` | pass |
| `node scripts/test_gate_b_live_tab_logo_rows.mjs` | pass |
| `node scripts/test_trip_thing_logo_metadata.mjs` | pass |
| `node scripts/test_shared_trip_live_tab_logos.mjs` | pass |
| `node scripts/check-no-comments.mjs` | pass |
| `node scripts/test_offline_manifest.mjs` | pass |
| `BASE=vk node scripts/check-code-ratchet.mjs` | pass |

**Uncommitted files:** `src/vacation/shared-trip-live-app-fields.mjs`, `src/vacation/shared-trip-fixture-replay.mjs`, `src/vacation/thing-logo-capture.mjs`, `src/vacation/keepsake-product-overrides.mjs`, `J/RECEIPT.md`

Host: commit → push → Gate B structure (events/hotels 390+1280) on pushed head.

## Round vkfill-590 @ 5f42857c (2026-11-02 08:28 PT lane, claude-ubuntu, HOST PUBLICATION ONLY)

**Start head:** `5f42857c11385a95e3a97bef993d7eb188812f23` (matches PR head and brief). No host merge was staged in this worktree, so the base-merge TARGET did not apply. No merge, rebase or commit was made here.

**CI failure (the PR's own regression):** `unit-tests` has failed on every head published today. The runs are 41463815206 (`c364a0cd`), 41471904494 (`2afbe696`) and 41480118825 (`5f42857c`, job 125395878271), and each fails at `scripts/test_gate_b_product_row_fields.mjs:279`: "candidate and base paths must hash the same finalized payload" (`188276…d4b2` vs `e3c15f…1b42`). On `d6deba0f` it was green (job 119550355468). The failure reproduces locally.

**Root cause:** `applyListRowLogoFields` (added in `c364a0cd`) wrote the derived page URL onto `place.url`/`place.website` after `applyThingDetailOverrides` had already run. On the next finalize, `writeRatings` reads `place.url` and adds `thingOverrides[place:*].sourceUrl` (rows 632–634, Southwest options). So `finalizeServedSharedTripPayload` was not idempotent.

**Patch (uncommitted, host push):**
- `src/vacation/shared-trip-live-app-fields.mjs`: stop writing `place.url`/`place.website`. Give `resolveThingLogoUrl` a lookup copy that carries the page URL instead. Override `url`/`website`/`logoUrl` writes and the replay path (`mutatePlace: false`) are unchanged.

**Effect check (job-dir `cmp.mjs`, old HEAD module vs patched):**
- daybyday, pr225 and positive NYC fixtures: 0 chip changes and 0 `thingOverrides` changes.
- The only `place` keys that change are the dropped derived `url`/`website`.
- `applyServedListLogoOverridesOnly` (Gate B replay) output is byte-identical.
- No visible change is expected.

**Checks @ 5f42857c + patch:**
| Command | Result |
| --- | --- |
| `node scripts/test_gate_b_product_row_fields.mjs` | pass (was the CI failure) |
| `cd apps/vacation-client && npm ci && npm run typecheck && npm run lint && npm run test` (CHROME_PATH=chromium) | pass, layout suites included |
| every entry of `scripts/offline-tests.txt` (279) | 274 pass, 5 env-only fails (below) |
| `node scripts/check-no-comments.mjs` | pass (818 files) |
| `node scripts/test_offline_manifest.mjs` | pass (279 offline, 17 online) |
| `BASE=vk node scripts/check-code-ratchet.mjs` | pass (255 report, 0 fail; local `origin/vk` = `ebaaa74`) |

The 5 env-only fails, all of which CI ran green before line 150 on `5f42857c` or with a chrome shim here:
- `test_day_by_day_map_marker_bounds_chrome` (no `/usr/bin/google-chrome-stable`)
- `test_live_transcript_dialog_pdf` (lane PDF env)
- `test_same_selection_capture` and `test_capture_fixture_replay_harness` ("missing but already registered worktree" under `pr-src/capture-producer-roots`)
- `test_purchase_email_app_link` (no `google-chrome`; it passes with a job-dir chromium shim)

**Still open for the host / managing dr (not codeable in this lane):**
- **Base merge:** PR is `mergeable_state=dirty` against `vk` `cf6c9627` (357 commits behind; merge-base `e3364ac5`). The host base-merge lanes `vkfill-590-20261102075309` and `-080309` (start `2afbe696`, base_tip `ebaaa74e`) ended source-ready but stayed unpublished: "host commit refused: 508 staged paths" (their `manual-publish.log`). A real merge into `vk` needs that publisher guard decided by the host or managing dr. A read-only legacy `git merge-tree e3364ac5 HEAD cf6c9627` shows text conflicts only in `J/PR_DESCRIPTION.md`, `J/RECEIPT.md` and `public/assets/index-BKun7ofk.js`, plus `evidence/*.png` added on both sides. `vk`'s only change to the patched file (`pickLongDetails` description fallbacks) does not touch the patched lines.
- **Gate B gap:** #588 gap-close FAIL on `d6deba0` (gateb-verdicts line 532, run 20261102-141548) and on `c364a0c` (line 534, run 20261102-144440): "generic logo on 7 of 29 rows" on events-1280. There is no Gate B verdict yet for `2afbe69`/`5f42857`, so whether the `2afbe696` replay-path enrichment closes the gap is unproven. This patch does not change the replay payload.

**Seen, left alone (scope):** `c364a0cd` added `transform:"translateY(-3px)"` to the chip emoji fallback in `trek-live-product-patches.mjs` (a look change). `5f42857c` committed 42 test-generated `evidence/*.png` files. This lane restored its own `npm test` evidence rewrites to HEAD.

**Uncommitted files:** `src/vacation/shared-trip-live-app-fields.mjs`, `J/RECEIPT.md`, `J/PR_DESCRIPTION.md`

Host: commit → push once → CI `unit-tests` on the pushed head → Gate B structure (events/hotels 390+1280).
