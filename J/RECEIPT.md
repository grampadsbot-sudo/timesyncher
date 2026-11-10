Host base-merge: `origin/vk` `b1211bf9eea151ba7aec5eca2bdf39cabbc0cd6a` into PR head `49e1fab3d710d3b86d2f06779b5ace0ce2eaab2e`. **Lane start HEAD:** `49e1fab3d710d3b86d2f06779b5ace0ce2eaab2e` (verified). **Model:** composer-2.5. **Outcome:** SOURCE-READY (uncommitted; HOST PUBLICATION ONLY).

# PR #896 / issue #888 — flight time chips @390

## Problem restatement

At 390px, shared-trip and vacation-client flight list cards kept depart and arrive time chips on one horizontal row. Non-shrinking `min-width: max-content` on `.tsv-row-flight-time` and `[data-ts-flight-time="1"]` (`apps/vacation-client/src/styles.css` @media max-width 480px; `ISSUE_888_SERVED_LAYOUT_CSS` in `src/vacation/shared-trip-oe-list-row-patch.mjs`) let full arrival strings extend past the card’s right padding, clipping text and the card border. Day-by-day conflict wrap and airline logos were already correct on this head.

## Product fix (on branch head; preserved through vk merge)

- **Served rows:** `ISSUE_888_SERVED_LAYOUT_CSS` — two-row CSS grid for `[data-ts-flight-row-grid="1"]` at ≤480px; times on row 2; logo/name column spans rows; `SHARED_LIVE_FLIGHT_LOGO_NAME_CSS` for chip alignment.
- **Vacation client:** `.tsv-row-flight-main` @390 — logo row 1 col 1; title stack cols 2–4; price col 4; depart/arrive row 2 cols 3–4.
- **Rebake:** `node scripts/rebake_served_trek_bundle.mjs` after merge (host index).

# Host merge conflict resolution @ `49e1fab3`

| Path | Resolution |
| --- | --- |
| `J/PR_DESCRIPTION.md` | #896/#888 description + vk carry notes (#927 hero, #884, #903). |
| `J/RECEIPT.md` | This file. |
| `evidence/.../flights-390.png` | PR side (HEAD): #888 flight layout evidence. |
| `evidence/.../detail-enriched-{activity,bar,transport}-1280.png` | vk side: current base detail screenshots. |
| `evidence/.../keepsake-390.png` | vk side: current base keepsake screenshot. |
| `public/ts-trip-hero-collapse.js` | vk carry: expanded hero title wrap (#939 / #927). |
| `scripts/test_vacation_app_927_hero_collapse.mjs` | vk carry: hero collapse test aligned with wrap behaviour. |

## Checks @ PATCH (lane END)

| Command | Result |
| --- | --- |
| `node scripts/rebake_served_trek_bundle.mjs` | PASS sha256 `b55a05c5d06af5b8de03235791d4a320457d7a264c1d2bafc4900f7893b78005` |
| `node scripts/test_served_trek_bundle.mjs` | PASS |
| `node scripts/test_issue_888_clipped_text.mjs` | PASS (390 DOM chip bounds) |
| `node scripts/test_vacation_app_927_hero_collapse.mjs` | PASS |
| `node scripts/test_issue_928_daybyday_arrival_conflicts.mjs` | PASS |
| `node scripts/test_ui_558_daybyday_time_name_baseline.mjs` | PASS |
| `cd apps/vacation-client && npm test` | PASS |
| `node scripts/check-no-comments.mjs` | PASS (1142 files) |
| `node scripts/test_offline_manifest.mjs` | PASS (445 offline, 19 online) |
| `BASE=vk node scripts/check-code-ratchet.mjs` | PASS (251 report, 0 fail) |

## Uncommitted for host

- **Conflict markers cleared (index still UU until `git add`):** `J/PR_DESCRIPTION.md`, `J/RECEIPT.md`, `evidence/vacation-client-p2-2-lists/flights-390.png` (ours), `evidence/vacation-client-p2-5-detail/detail-enriched-activity-1280.png`, `detail-enriched-bar-1280.png`, `detail-enriched-transport-1280.png`, `evidence/vacation-client-p2-6-keepsake/keepsake-390.png` (theirs).
- **In-progress merge tree:** ~67 paths staged/modified from host `origin/vk` merge (see `git status`); no new product edits this lane round beyond conflict resolution.
- Rebake run confirmed bundle sha256 unchanged vs head.

**Host:** `git add` resolved paths; `git commit --no-edit` (merge); push `vkfill/888-20261109142715`; CI; Gate B allow `888`.

## Left alone (scope)

Baselines, Gate B capture scripts, workflows, `package.json` / lock, deploy config. No NYC data writes. Lane did not stage, commit, push, or merge (HOST PUBLICATION ONLY).
