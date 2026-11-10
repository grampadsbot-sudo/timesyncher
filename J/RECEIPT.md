# PR #885 / issue #884 — logo-chip fallback hide + vk base merge (HOST PUBLICATION ONLY)

**Outcome:** source-ready PATCH (uncommitted; HOST PUBLICATION ONLY). **Lane start HEAD:** `e1307ba6b61d142597267201b7be39eeb8465201` (verified at round launch).

**Host base merge:** `origin/vk` at `85fae5b37a899e737b570b71d052def772d42b16` into `e1307ba6`. **Conflicts:** `J/RECEIPT.md` only. Served bundle rebaked after merge (see below).

Authority: Craig tech-call 2026-11-09 ~12:31 PM PT — hide `.tsv-logo-fallback` after brand `img` loads; show only on missing/broken logo.

GBrain handoff `bot-admin/lanes/vk-pr-handoff/pr-885`: not re-fetched this round (prior rounds: page_not_found at some launches).

## Root cause (#884)

`dc()` logo chips stacked `.tsv-logo-fallback` (category emoji, e.g. hotel suitcase) in the same grid cell as the brand `img` with both at `display:grid`, so TownePlace detail showed suitcase-over-Marriott after favicon load.

## Fix (#884 — product sources, on branch)

| Path | Change |
| --- | --- |
| `src/vacation/thing-logo-ink-center.mjs` | `dc()` patch: fallback `display:zt?"none":"grid"`; img ref/onLoad hide fallback when `naturalWidth>1`; ink centering hides fallback on successful paint. |
| `src/vacation/thing-logo-fallback-url.mjs` | `logoImgOnLoadInline` sets fallback `display:none` on successful load; `logoImgOnErrorInline` sets `display:grid` on final failure; Marriott 16px favicon → gstatic 64px repair. |
| `src/vacation/shared-trip-logo-audit.mjs` | Gate B DOM check `fallback_stack` when loaded img and visible `.tsv-logo-fallback` coexist. |
| `public/assets/index-BKun7ofk.js` | Rebaked via `node scripts/rebake_served_trek_bundle.mjs` (sha256 `9183847c5fa72e9d7696dfdbb3b6f3b3128bfe37d97f097bd1457fe81a1f27aa`, bytes=6597401). |
| `apps/vacation-client/src/lib/logoChipHandlers.mjs` | Hide `.tsv-logo-fallback` on successful load; show `display:grid` on final failure; timeline-icon host + small `.ico` acceptance (#909 carry). |
| `scripts/test_ui_884_logo_chip_fallback_hide.mjs` | Offline test for inline handlers, DOM check, bundle needles. |
| `scripts/test_shared_trip_live_tab_logos.mjs` | Assert hide-until-broken contract. |

## vk carry merged with #884 (keep both behaviours)

From vk merge (staged index; not re-authored in this round):

1. **Trip 99 stand-ins (#901 / PR #908)** — fixture + hosted replay + Neon apply path: `J/trip99-change.sql`, `J/trip99-change.json`, `J/trip99-backup.sql`, `J/REVERT.md`, `scripts/fixtures/nyc-screen-trip99-live-shared-api.json`, `gate-b-nyc-shared-staging.json`, `pr336-vk-search-places.snapshot.json`, `nyc_ccab_place_enrichment.json`, `scripts/test_issue_901_trip99_single_venue_standins.mjs`, `src/vacation/trip99-thing-standin-check.mjs`, `scripts/ops/capture/capture-pre-data-check.mjs`, `scripts/offline-tests.txt` (vk registration).
2. **Chat / itinerary edit (#905 port)** and other vk paths on the staged merge index (see prior vk receipts if needed).

### #901 unit-tests fix (inherited, authoritative on staged data)

| check | detail |
| --- | --- |
| Failure | `test_gate_b_live_replay_display_facts.mjs`: served place 664 price `65 !== 25`; `externalId` drift 664/669. |
| Root cause | Gate B served fixture updated but hosted live replay lagged; ccab `price` 0 → null lets estimator price 664 at 65. |
| Price 664 | Dossier free; `$0` banned; positive Gate B contract needs a price — fixtures use estimator **65**; ccab enrichment **null**. |

Host: apply `J/trip99-change.sql` + `J/trip99-change.json` before expecting live `/api/shared` to match fixtures (#901 scope; not #884).

## Gate B / screen_probe (#884)

Permanent regression: `fallback_stack` in `visibleLogoDomCheckSource` via `runVisibleSharedLogoCheck` (`scripts/lib/shared-trip-visible-logo-check.mjs` → `scripts/ops/gateb/restore-check-visible-logos.mjs`).

Host: NYC evidence `towneplace-logo-390.png`, `towneplace-logo-1280.png`, `broken-fallback-390.png`, `broken-fallback-1280.png` after push + live deploy.

## Handoff hold (unchanged)

GBrain handoff `hold:test-trip fixture` — places[23] Marriott `logoUrl` replay vs live is a **data/harness fault**, not a #884 UI stacking fix. No fixture rewrite this round (brief bans hard-coding NYC test trip).

## Local proof (@ `e1307ba6` + conflict resolve + rebake)

| Command | Result |
| --- | --- |
| `node scripts/rebake_served_trek_bundle.mjs` | PASS sha256 `9183847c…` bytes=6597401 |
| `node scripts/test_ui_884_logo_chip_fallback_hide.mjs` | PASS |
| `node scripts/test_shared_logo_chip_center_bundle.mjs` | PASS |
| `node scripts/test_shared_trip_live_tab_logos.mjs` | PASS (after root `npm ci`) |
| `node scripts/test_served_trek_bundle.mjs` | PASS |
| `node scripts/test_issue_901_trip99_single_venue_standins.mjs` | PASS |
| `node scripts/test_gate_b_live_replay_display_facts.mjs` | PASS |
| `node scripts/test_gate_b_product_row_fields.mjs` | PASS (skipped=1) |
| `node scripts/test_offline_manifest.mjs` | PASS (437 offline, 18 online) |
| `BASE=vk node scripts/check-code-ratchet.mjs` | PASS (252 report, 0 fail) |
| `node scripts/check-no-comments.mjs` | PASS (1129 files; `apps/vacation-client/npm ci` first) |

No CI run id on this uncommitted tree; pending host merge commit + one push to `vkfill/884-20261109123208`.

## Host publish (uncommitted)

1. **`J/RECEIPT.md`** — merge conflict resolved (this file).
2. **`public/assets/index-BKun7ofk.js`** — rebaked (host must `git add` if not already on index).
3. **Staged vk merge tree** — trip99 fixtures, capture pre-data, offline manifest line, `J/PR_DESCRIPTION.md` (#901 text on branch; host may rewrite PR body for #885 vs #901 per pipeline).
4. **No new trek `#884` patcher edits this round** — logo fallback hide already in sources; conflict round = vk base sync + receipt + rebake verify.

## Not touched

Baselines, Gate B config thresholds, `package.json`, deploy config. Did not edit workflows or capture scripts beyond vk-staged paths. Did not stage, commit, push, or merge (lane HOST PUBLICATION ONLY).
