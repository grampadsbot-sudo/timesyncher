# PR #896 / issue #888 — host vk merge conflict resolve @ `eea0e50c`

**Outcome:** SOURCE-READY (uncommitted; HOST PUBLICATION ONLY). **Starting HEAD:** `eea0e50cac463e3cf744ead29409e2f2ee740d18`. **Merged base:** `ed8687b929c9473e6f9f2915ac5bc82d6dd802d1` (`origin/vk`). **Model:** composer-2.5.

## Problem (flights @390 — unchanged intent on branch)

At 390px, flight cards clipped arrival times and the right border because depart/arrive chips stayed on one row with `min-width: max-content` and `flex-shrink: 0` (`apps/vacation-client/src/styles.css` `.tsv-row-flight-main` @media; served `ISSUE_888_SERVED_LAYOUT_CSS` / `FLIGHT_QO_INLINE_PATCH` in `shared-trip-oe-list-row-patch.mjs`).

## Product fix (already on branch; preserved through merge)

- `apps/vacation-client/src/styles.css`: row 1 logo / name span / price; row 2 departure + arrival in columns 3–4.
- `src/vacation/shared-trip-oe-list-row-patch.mjs`: two-line grid for Qo/QoRest; `SHARED_LIVE_FLIGHT_LOGO_NAME_CSS` uses `align-items:center` on flight logo+name (no `margin-top` chip offset — fixes Gate B logo-vs-name vertical drift).
- Rebake applies patch into bundle.

## This round — conflict resolution

| file | resolution |
| --- | --- |
| `public/assets/index-BKun7ofk.js` | `git show :3:` (vk), then `node scripts/rebake_served_trek_bundle.mjs` |
| `scripts/offline-tests.txt` | **Both** `test_issue_888_clipped_text.mjs` and `test_issue_903_live_qa_polish.mjs` |
| `J/PR_DESCRIPTION.md`, `J/RECEIPT.md` | Merged #888 + #903/#884/#927 carry narrative |
| `evidence/vacation-client-p2-*/*.png` | vk stage-3 binaries (`:3:`) |

## Checks @ `eea0e50c` + conflict resolution (uncommitted)

| Command | Result |
| --- | --- |
| `node scripts/rebake_served_trek_bundle.mjs` | PASS sha256 `a28ae655a996a3c264c237941d780a10b84eb571c525b485fff6e92b1781da97` |
| `node scripts/test_served_trek_bundle.mjs` | PASS |
| `node scripts/test_issue_888_clipped_text.mjs` | PASS (390 DOM chip bounds) |
| `node scripts/test_issue_903_live_qa_polish.mjs` | PASS |
| `node scripts/test_ui_884_logo_chip_fallback_hide.mjs` | PASS |
| `node scripts/test_shared_logo_chip_center_bundle.mjs` | PASS |
| `node scripts/test_shared_trip_live_tab_logos.mjs` | PASS |
| `node scripts/test_shared_tab_list_summary.mjs` | PASS |
| `node scripts/test_chat_itinerary_edit_905.mjs` | PASS |
| `cd apps/vacation-client && npm test` | PASS |
| `node scripts/check-no-comments.mjs` | PASS (1139 files) |
| `node scripts/test_offline_manifest.mjs` | PASS (443 offline, 19 online) |
| `BASE=vk node scripts/check-code-ratchet.mjs` | PASS (251 report, 0 fail) |

**Uncommitted paths for host commit:** all conflict resolutions above, plus staged merge product paths from host index (vk carry: #903, #927, #925, #884, fixtures, tests).

**Host:** `git add` all resolved UU + merge index; `git commit --no-edit`; push `vkfill/888-20261109142715`; CI; Gate B `gateb-allow.json["888"]`.

---

# PR #896 — flights @390 time chips + logo alignment (pre-merge product receipt)

Gate B kickback: logo high vs name 5–6px — fixed via `SHARED_LIVE_FLIGHT_LOGO_NAME_CSS` center alignment (see patch SoT). Time-chip grid @390 unchanged from prior fix.
