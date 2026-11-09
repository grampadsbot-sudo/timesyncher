# Issue #861 — chat itinerary undo on copy trip (cursor-ubuntu)

Outcome: **source-ready** (HOST PUBLICATION ONLY). Start HEAD: `15041c9a3257c4e44b4d00074156ca8c515a6999`.

## Changes

| File | Why |
| --- | --- |
| `src/vacation/chat-itinerary-edit.mjs` | Undo client payload now includes `op: 'undo'`; `nothing_to_undo` returns a client `{ applied: false, reason: 'nothing_to_undo' }`; `offlineParseItineraryEditIntent` accepts `{ customerTurn }` objects (same shape as `extractItineraryEditIntent` callers). |
| `scripts/test_chat_itinerary_edit.mjs` | Unit coverage: parse `undo`, `nothing_to_undo`, set_time → undo restores `19:00`, demo_locked `8CQX` on undo. |

Undo path was already implemented (`loadLatestEdit`, merge `before_json`, `PUT overrides`); gaps were API client shape, offline parser call signature for short turns like `undo`, and missing tests.

## Checks (worktree uncommitted at `15041c9a`+)

| Command | Result |
| --- | --- |
| `node scripts/test_chat_itinerary_edit.mjs` | PASS |
| `node scripts/check-no-comments.mjs` | PASS (1106 files) |
| `node scripts/test_offline_manifest.mjs` | PASS (424 offline, 18 online) |
| `BASE=vk node scripts/check-code-ratchet.mjs` | PASS (252 report, 0 fail) |

CI / Gate B / live 8CQX hash probe: not run (host publication only).

## Uncommitted diff for host

```
 scripts/test_chat_itinerary_edit.mjs | 139 +++++++++++++++++++++++++++++++++-
 src/vacation/chat-itinerary-edit.mjs |  11 ++-
 2 files changed, 146 insertions(+), 4 deletions(-)
```

## Left alone (scope)

- Live copy-trip e2e still depends on staging `set_time` (#859 upstream PUT); unit test fakes fetch/PUT and proves undo restore.
- No `trek-style2-bundle.mjs` or baseline edits (8CQX hash guard).
- `scripts/offline-tests.txt` unchanged (tests added to existing `scripts/test_chat_itinerary_edit.mjs`).
