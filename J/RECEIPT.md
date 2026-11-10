# PR #885 / issue #884 — logo-chip fallback hide + vk base merge (HOST PUBLICATION ONLY)

**Outcome:** source-ready PATCH (uncommitted; HOST PUBLICATION ONLY). **Lane start HEAD:** `3d66a7e05a74095aa26926f29ce051aaaa001f6c` (verified at round launch).

**Host base merge:** `origin/vk` at `1ffd23ca895d39db3ea28eff62c7e02279881557` into `3d66a7e0` (per lane handoff). **Conflicts:** `J/RECEIPT.md` only (resolved this round). Staged vk tree: trip99/vkprloop drift #915+#921, vacation-app shell, chat itinerary edit port, `scripts/offline-tests.txt` (both drift tests registered). No `public/assets/*.js` merge conflict; rebaked bundle unchanged on disk.

Authority: Craig tech-call 2026-11-09 ~12:31 PM PT — hide `.tsv-logo-fallback` after brand `img` loads; show only on missing/broken logo.

GBrain handoff `bot-admin/lanes/vk-pr-handoff/pr-885`: queued Gate B on `3d66a7e0`; this round completes in-progress vk merge + receipt only (no new `#884` product edits).

## Conflict resolution (@ `3d66a7e0`)

| file | resolution |
| --- | --- |
| `J/RECEIPT.md` | Merged HEAD #885 receipt with vk merge notes; removed conflict markers only. |
| `scripts/offline-tests.txt` | **Both** `scripts/test_vkprloop_drift_921.mjs` (vk) and `scripts/test_vkprloop_drift_915.mjs` (vk) — already staged from merge. |

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

From vk merge (staged index; not re-authored in this round): vacation-app shell/CSS, `scripts/probe_header_live.mjs`, chat itinerary edit (#905 port), vkprloop drift fixtures/tests #915+#921, layout/shell tests — see staged paths in `git status`.

### #901 unit-tests fix (inherited on branch)

| check | detail |
| --- | --- |
| Failure | `test_gate_b_live_replay_display_facts.mjs`: served place 664 price drift vs ccab. |
| Root cause | Gate B served fixture updated but hosted live replay can lag; ccab `price` 0 → null lets estimator price 664 at 65. |
| Price 664 | Dossier free; `$0` banned; positive Gate B contract needs a price — fixtures use estimator **65**; ccab enrichment **null**. |

Host: apply `J/trip99-change.sql` + `J/trip99-change.json` before expecting live `/api/shared` to match fixtures (#901 scope; not #884).

## Gate B / screen_probe (#884)

Permanent regression: `fallback_stack` in `visibleLogoDomCheckSource` via `runVisibleSharedLogoCheck` (`scripts/lib/shared-trip-visible-logo-check.mjs` → `scripts/ops/gateb/restore-check-visible-logos.mjs`).

Host: NYC evidence `towneplace-logo-390.png`, `towneplace-logo-1280.png`, `broken-fallback-390.png`, `broken-fallback-1280.png` after push + live deploy.

## Handoff hold (unchanged)

`hold:test-trip-fixture` — places[23] Marriott `logoUrl` replay vs live is a **data/harness fault**, not a #884 UI stacking fix. No fixture rewrite this round (brief bans hard-coding NYC test trip).

## Local proof (@ `3d66a7e0` + conflict resolve)

| Command | Result |
| --- | --- |
| `node scripts/rebake_served_trek_bundle.mjs` | PASS sha256 `9183847c…` bytes=6597401 |
| `node scripts/test_ui_884_logo_chip_fallback_hide.mjs` | PASS |
| `node scripts/test_shared_logo_chip_center_bundle.mjs` | PASS |
| `node scripts/test_shared_trip_live_tab_logos.mjs` | PASS (after root `npm ci`) |
| `node scripts/test_served_trek_bundle.mjs` | PASS |
| `node scripts/test_vkprloop_drift_915.mjs` | PASS |
| `node scripts/test_vkprloop_drift_921.mjs` | PASS |
| `node scripts/test_issue_901_trip99_single_venue_standins.mjs` | PASS |
| `node scripts/test_gate_b_live_replay_display_facts.mjs` | PASS |
| `node scripts/test_offline_manifest.mjs` | PASS (439 offline, 18 online) |
| `BASE=vk node scripts/check-code-ratchet.mjs` | PASS (252 report, 0 fail) |
| `node scripts/check-no-comments.mjs` | PASS (1132 files; root + `apps/vacation-client` `npm ci` first) |

No CI run id on this uncommitted tree; pending host `git add J/RECEIPT.md` + merge commit + one push to `vkfill/884-20261109123208`.

## Host publish (uncommitted)

1. **`J/RECEIPT.md`** — conflict resolved (this file); `git add` to mark resolved.
2. **`git commit --no-edit`** — conclude vk merge into `3d66a7e0`.
3. Push once to `vkfill/884-20261109123208`; then queued Gate B on new head per handoff `pr-885`.
4. Staged vk paths only — no extra trek `#884` edits this round.

## Not touched

Baselines, Gate B config thresholds, `package.json`, deploy config, workflows. Did not stage, commit, push, or merge (lane HOST PUBLICATION ONLY).
