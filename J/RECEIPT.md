# PR #896 / #888 — tripBadge test sync (cursor-ubuntu / composer-2.5)

**Outcome:** source-ready PATCH (uncommitted; host commit+push). **Start HEAD:** `b39c6b3b18041b1d55ad3eb5cc2123b992a70643`.

## Change

- **`scripts/test_real_app_entry.mjs`** — Offline gate eval’d removed `tripBadge` from `vacation-app.html`; assert `tripDates` / `tripTitle` and comma date format (`Jun 1–3, 2026`) per `tripDates()` in product shell (same contract as `scripts/test_trip_dropdown_human_status_848.mjs`). No product restore of `tripBadge`.

## Checks run (this lane)

| Check | Result |
| --- | --- |
| `node scripts/test_real_app_entry.mjs` | PASS |
| `node apps/vacation-client/test/list-layout.mjs` | PASS (flights-390 logo ink) |
| `node scripts/check-no-comments.mjs` | PASS (1119 files) |
| `node scripts/test_offline_manifest.mjs` | PASS (431 offline, 18 online) |
| `BASE=vk node scripts/check-code-ratchet.mjs` | host — run at publish |

## Uncommitted (host publish)

- `scripts/test_real_app_entry.mjs`
- `J/RECEIPT.md`

Local `list-layout.mjs` run refreshed `evidence/vacation-client-p2-*` PNGs; reverted with `git checkout -- evidence/` so the host patch stays test-only.

## Scope left alone

Vacation-client flight row CSS (already PASS list-layout on `b39c6b3b`), Gate B capture, baselines, `package.json`, NYC fixture data, unrelated PRs #884/#882/#889/#865.

## Gate B / rowcheck

**Host:** `git commit` → push `vkfill/888-20261109142715`; confirm CI `unit-tests`; host rowcheck flights-390/1280 + Gate B structure on new head.
