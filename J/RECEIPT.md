# Issue #884 — hide logo-chip fallback once brand img paints (cursor-ubuntu / PR #885)

**Start HEAD:** `7ba76b158f793e5b2d6d575ee1d98df85ef0798b` (verified at lane launch).

Authority: Craig tech-call 2026-11-09 ~12:31 PM PT — hide `.tsv-logo-fallback` after brand `img` loads; show only on missing/broken logo.

GBrain handoff `bot-admin/lanes/vk-pr-handoff/pr-885`: **page_not_found** on fetch (not in GBrain at lane launch).

## Root cause

`dc()` logo chips stacked `.tsv-logo-fallback` (category emoji, e.g. hotel suitcase) in the same grid cell as the brand `img` with both at `display:grid`, so TownePlace detail showed suitcase-over-Marriott after favicon load.

## Fix (on branch — commit `6c4006fb` and rebaked bundle on `7ba76b15`)

| Path | Change |
| --- | --- |
| `src/vacation/thing-logo-ink-center.mjs` | `dc()` patch: fallback `display:zt?"none":"grid"`; img ref/onLoad hide fallback when `naturalWidth>1`; ink centering hides fallback on successful paint. |
| `src/vacation/thing-logo-fallback-url.mjs` | `logoImgOnLoadInline` sets fallback `display:none` on successful load; `logoImgOnErrorInline` sets `display:grid` on final failure; Marriott 16px favicon → gstatic 64px repair. |
| `src/vacation/shared-trip-logo-audit.mjs` | Gate B DOM check `fallback_stack` when loaded img and visible `.tsv-logo-fallback` coexist (`visibleLogoDomCheckSource` + `logoChipFallbackStackDomCheckSource`). |
| `public/assets/index-BKun7ofk.js` | Rebaked via `node scripts/rebake_served_trek_bundle.mjs` (sha256 `af2122b3e39f5a2856a0ee790a5423af6bf44f60e4bbddbda82db25525386d84`). |
| `scripts/test_ui_884_logo_chip_fallback_hide.mjs` | Offline test for inline handlers, DOM check, bundle needles. |
| `scripts/test_shared_trip_live_tab_logos.mjs` | Assert hide-until-broken contract. |
| `scripts/test_shared_logo_chip_center_bundle.mjs` | Updated ref/display assertions. |

## Gate B / screen_probe

Permanent regression: `fallback_stack` in `visibleLogoDomCheckSource` via `runVisibleSharedLogoCheck` (`scripts/lib/shared-trip-visible-logo-check.mjs` → `scripts/ops/gateb/restore-check-visible-logos.mjs`).

Host: NYC evidence `towneplace-logo-390.png`, `towneplace-logo-1280.png`, `broken-fallback-390.png`, `broken-fallback-1280.png` after push + live deploy.

---

## Host base merge (PR #885, 2026-11-09 ~2:40 PM PT)

Host merged `origin/vk` at `412e26e95ae02b0e31c185896833cbc9d83e6e31` into PR head `7ba76b158f793e5b2d6d575ee1d98df85ef0798b` (`basemerge.json` in job dir). **Conflict:** `J/RECEIPT.md` only (resolved below). Rebake unchanged: sha256 `af2122b3e39f5a2856a0ee790a5423af6bf44f60e4bbddbda82db25525386d84`.

### vk carry merged with this receipt (#870 composer mic — `origin/vk`)

Staged from vk (host merge commit; not #884 product scope):

1. **`public/vacation-app-request.js` — `bindVoice`:** inline composer errors, `getUserMedia` / `SpeechRecognition` hardening, recording timer on `#voiceElapsed`.
2. **`vacation-app.html`:** `#voiceElapsed` beside `#voiceButton`.
3. **`scripts/test_issue_870_composer_mic.mjs`:** offline harness (registered in `scripts/offline-tests.txt`).
4. **Evidence PNGs** (`evidence/vacation-client-p2-3-day/*`, `evidence/vacation-client-p2-5-detail/*`): vk blobs from merge — discard unless host wants updated layout evidence.

---

## Local proof (this lane, start HEAD `7ba76b15`)

| Command | Result |
| --- | --- |
| `node scripts/test_ui_884_logo_chip_fallback_hide.mjs` | PASS |
| `node scripts/test_shared_trip_live_tab_logos.mjs` | PASS |
| `node scripts/test_shared_logo_chip_center_bundle.mjs` | PASS |
| `timeout 60 node scripts/test_issue_870_composer_mic.mjs` | PASS |
| `node scripts/rebake_served_trek_bundle.mjs` | PASS (hash unchanged) |
| `node scripts/check-no-comments.mjs` | PASS (1118 files) |
| `node scripts/test_offline_manifest.mjs` | PASS (431 offline, 18 online) |
| `BASE=vk node scripts/check-code-ratchet.mjs` | PASS (252 report, 0 fail) |

## Host publish (uncommitted)

- `J/RECEIPT.md` — conflict resolved (this file); `git add` required.
- Merge-staged vk: `public/vacation-app-request.js`, `vacation-app.html`, `scripts/test_issue_870_composer_mic.mjs`, `scripts/offline-tests.txt`, evidence PNGs listed above.
- **No new product edits for #884 this round** — fix already on branch; this round finishes vk merge + receipt.

Host: `git add J/RECEIPT.md`; `git commit --no-edit` (or merge commit message); one push → CI green → Gate B logo evidence per chief brief.

## Not touched

Baselines, Gate B config thresholds, `package.json`, NYC trip fixture data, deploy config.
