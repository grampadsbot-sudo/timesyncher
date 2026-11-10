# PR #935 — lane cursor-ubuntu @ `c5e6be75`

**Outcome:** source-ready PATCH (uncommitted; HOST PUBLICATION ONLY). **Start HEAD:** `c5e6be755c3a33aa3ddd5d9ebd6c758bb7348a84` (verified). **Lane:** cursor-ubuntu, composer-2.5.

**GBrain handoff:** `bot-admin/lanes/vk-pr-handoff/pr-935` not found on this pass (fetch failed in brief).

## Host merge `origin/vk` @ `ed8687b9` into `c5e6be75`

| Path | Resolution |
| --- | --- |
| `public/assets/index-BKun7ofk.js` | Took merge stage-3 (vk), then `node scripts/rebake_served_trek_bundle.mjs` → sha256 `31e9a3798d0a68adbc154e850d1ea263f9c609ba66112af115f4330703fc8364`. Host must `git add` to clear `UU`. |

## This round (#558 CI / eggbot follow-up 12:52 AM PT 11/10)

**Root cause:** `scripts/test_ui_558_daybyday_time_name_baseline.mjs` clicked Day chips without waiting; every pass still read Day 1. #928 correctly conflict-flags Zabar's, Carbone, and Blue Note on Day 1, so zero eligible single-time rows remained (`count=0`).

**Fix (test harness only; #928 product logic untouched):**

| Path | Change |
| --- | --- |
| `scripts/test_ui_558_daybyday_time_name_baseline.mjs` | Wait for timeline title fingerprint after Day chip click; measure Day 1 + Day 2; assert Statue or Strand sampled; keep conflict-row skip rule. |

## Prior branch PATCH (still uncommitted on host)

#928 arrival-day conflict flags, 390 banner wrap, `scripts/test_issue_928_daybyday_arrival_conflicts.mjs`, vk merge carry (#903/#927/etc.) per existing staged diff — not re-authored this round.

## Checks @ PATCH (this lane)

| Command | Result |
| --- | --- |
| `node scripts/test_ui_558_daybyday_time_name_baseline.mjs` | PASS |
| `node scripts/test_issue_928_daybyday_arrival_conflicts.mjs` | PASS |
| `node scripts/test_served_trek_bundle.mjs` | PASS |
| `node scripts/check-no-comments.mjs` | PASS (1140 files) |
| `node scripts/test_offline_manifest.mjs` | PASS (443 offline, 19 online) |
| `BASE=vk node scripts/check-code-ratchet.mjs` | PASS (252 report, 0 fail) |

CI run id: pending host push @ rebaked bundle + #558 fix.

## Host publish

1. `git add public/assets/index-BKun7ofk.js scripts/test_ui_558_daybyday_time_name_baseline.mjs` plus remaining staged PR paths; commit merge + #558 on `vkfill/928-20261110003023`; push once.
2. Exact-head CI (unit-tests must include #558 file).

## Scope left alone

- No revert of `applyDayTimelineConflictFlags` / banner wrap.
- Did not stage, commit, push, or merge (HOST PUBLICATION ONLY).
- `scripts/offline-tests.txt` not edited this round (prior branch staging).
- Evidence PNG churn from unrelated local `npm test` — host should not ship unless intended.
