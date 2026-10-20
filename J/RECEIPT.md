# PR #543 — vkfill-543-20261020132723 (client finalize + timeline baseline)

## Outcome

Gate B on `b40fd347` rendered the dispatch NYC head fixture without `finalizeServedSharedTripPayload`, so Day-by-Day missed airport legs, timeline flights, and list logos that staging parity expects. The vacation-client now finalizes every shared-trip JSON load the same way `shared-trip-handler` does on the server. Lane round `vkfill-543-20261020132723` re-ran pre-DONE gates and `test_shared_trip_boot_fetch.mjs` on tip `8b622381`; no further product diff (remote `vkfill/335-p3a-wiring-202610190827` already at that sha). **Done** for this lane = dispatcher CI + Ubuntu Gate B structure on `8b622381`.

## SHAs

| | SHA |
|---|---|
| Start (this brief) | `8b62238142980638fe008a18460c7b238c450f91` |
| Fix commit | `97d98747842c1a6e794bb21e5bf2a8ca2c3cd542` |
| Final HEAD | `1663ddd53cf1960a72ac615a7988a09bc0e5f620` |

## Changes

| Area | Fix |
|------|-----|
| `apps/vacation-client/src/api/loadSharedTrip.ts` | Run `finalizeServedSharedTripPayload` after fetch (Gate B capture serves raw head JSON). |
| `apps/vacation-client/src/styles.css` | Drop extra single-line timeline `padding-top` that put times ~3.5px off name baselines. |
| `scripts/test_shared_trip_boot_fetch.mjs` | Assert raw VK-shaped payload gains airport legs only after finalization. |

## Commands

| Command | Exit |
|---------|------|
| `node scripts/test_shared_trip_boot_fetch.mjs` | 0 (`CHROME_PATH=/snap/bin/chromium`) |
| `node scripts/check-no-comments.mjs` | 0 |
| `node scripts/test_offline_manifest.mjs` | 0 |
| `BASE=migrate/trek-source node scripts/check-code-ratchet.mjs` | 0 |
| `BASE=codex/ruling95-consolidated-logo node scripts/check-code-ratchet.mjs` | 0 |

## Left alone

Fixtures, baselines, Gate B scripts, `offline-tests.txt`, merge/push/deploy. `ManagingDrJudgmentPending` (22 checks) is managing-dr inbox work, not a coder round per `~/tsv-gateb/restore_check.py`.
