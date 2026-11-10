# PR #907 / #903 — host base-merge + DATA-CONTRACT title binding (head `10fd68ff`)

**Outcome:** source-ready PATCH (uncommitted; HOST PUBLICATION ONLY). **Start HEAD:** `10fd68ff799fb3c8ad5fa23f04c4cf7ca85d718d` (verified). **Lane:** cursor-ubuntu, composer-2.5.

Host merged `origin/vk` at `1ffd23ca895d39db3ea28eff62c7e02279881557` into `10fd68ff`. Conflicted: `J/RECEIPT.md`, `vacation-app.html` (resolved this round).

## Root cause (Gate B pregate DATA-CONTRACT)

`finalizeServedSharedTripPayload` applied `#903` title rewrites via `applyLiveQa903Presentation` while `scripts/regenerate_pr336_search_trip_fixture.mjs` snapshot rows still carried raw stored titles (609 Priceline opaque; 630/631 Southwest clock ranges).

## Fix

| area | change |
| --- | --- |
| `live-qa-903-presentation.mjs` | Stop rewriting stored `name`/`title` at serve time; keep jargon on narrative fields and flight time backfill only |
| Gate B NYC row sources | Stored customer-facing titles for 609 + Southwest 630–634 in `nyc-craig-kim-daybyday-rows.mjs` / trip builder / `GATE_B_DISPLAY_TITLE_ALIASES` |
| `vacation-app.html` | Merge: keep #903 fullscreen FAB (`bottom: 8px`) plus vk header/shell from staged index |

## Checks (this round)

| check | result |
| --- | --- |
| Title parity rows 609/630/631 (canonical `buildGateBApprovedSharedTrip` vs snapshot) | PASS (all match) |
| `node scripts/regenerate_pr336_search_trip_fixture.mjs` | PASS (94 places) |
| `node scripts/test_issue_903_live_qa_polish.mjs` | PASS |
| `node scripts/test_issue_832_day_timeline_binding.mjs` | PASS |
| `node scripts/test_gate_b_live_replay_display_facts.mjs` | PASS |
| `node scripts/rebake_served_trek_bundle.mjs` | PASS sha256=7afd665f… |
| `node scripts/test_offline_manifest.mjs` | PASS (439 offline, 18 online) |
| `node scripts/check-no-comments.mjs` | PASS (after `apps/vacation-client/npm ci`) |
| `BASE=vk node scripts/check-code-ratchet.mjs` | PASS (252 report, 0 fail) |

## Host publish

1. Finish merge: `git add J/RECEIPT.md vacation-app.html` + product/fixture paths touched; `git commit --no-edit`.
2. `node scripts/regenerate_pr336_search_trip_fixture.mjs`; commit snapshot if it moves.
3. `node scripts/rebake_served_trek_bundle.mjs` if vk `public/assets` base changed.
4. Pre-DONE: vacation-client tests, offline manifest, check-no-comments, code ratchet; CI + Gate B on new head.
