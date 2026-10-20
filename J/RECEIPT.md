# PR #543 — vkfill-543-20261020130722 (client finalize + timeline baseline)

## Outcome

Gate B on `b40fd347` rendered the dispatch NYC head fixture without `finalizeServedSharedTripPayload`, so Day-by-Day missed airport legs, timeline flights, and list logos that staging parity expects. The vacation-client now finalizes every shared-trip JSON load the same way `shared-trip-handler` does on the server.

## SHAs

| | SHA |
|---|---|
| Start | `b40fd3477ff5c2e316d7995089f3ceb9ecc3cf89` |
| Final HEAD | `a14586a4` |

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
