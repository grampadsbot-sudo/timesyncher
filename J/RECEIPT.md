# TSV #949 — NYC demo chat edit unlock (HOST PUBLICATION ONLY)

**Outcome:** source-ready PATCH. **Lane start HEAD:** `9c6b1df2d17c43fc87b29c6a510d391cd447d651`. **Lane:** cursor-ubuntu / composer-2.5. **Authority:** eggbot 7:14–7:15 AM PT 11/10 (`eggbot:unlock-nyc-chat-edit-20261110-0714`; GBrain `bot-admin/decisions/vk-demo-nyc-chat-edit-unlock-20261110`).

## Change

Craig: unlock NYC demo trip chat edits; do not restore from backup; keep user edits.

1. `config/chat-itinerary-edit-trips.json` — NYC demo share slug moved from `demo_locked` to `allowlist`; `chat-edit-demo-locked-fixture` retained in `demo_locked` for lock-path unit tests (no trip 99 / live data writes).
2. `src/vacation/chat-itinerary-edit.mjs` — `shareSlugEditGuardDecision` no longer hard-locks `DEMO_LOCKED_SLUG`; only `demo_locked` config entries block writes. Canned `demo_locked` reply path unchanged.
3. `scripts/test_chat_itinerary_edit.mjs`, `scripts/test_chat_itinerary_edit_905.mjs` — expect NYC allowlisted + guard `ok: true`; lock proofs use fixture slug only.

**Untouched:** trip 99 itinerary DB/JSON, demo chat history, baselines, deploy/CI config, dependencies.

## Uncommitted files (host commit + push)

- `config/chat-itinerary-edit-trips.json`
- `src/vacation/chat-itinerary-edit.mjs`
- `scripts/test_chat_itinerary_edit.mjs`
- `scripts/test_chat_itinerary_edit_905.mjs`
- `J/RECEIPT.md`

## Checks (worktree `9c6b1df2`, 2026-11-10)

| Command | Result |
| --- | --- |
| `node scripts/test_chat_itinerary_edit.mjs` | PASS |
| `node scripts/test_chat_itinerary_edit_905.mjs` | PASS |
| `node scripts/check-no-comments.mjs` | PASS |
| `node scripts/test_offline_manifest.mjs` | PASS |
| `BASE=vk node scripts/check-code-ratchet.mjs` | PASS |

CI / Gate B not run in lane (host publication).

## Host next

Branch from `vk` @ `9c6b1df2`, commit patch, push once, open PR into `vk` with `Closes #949`.
