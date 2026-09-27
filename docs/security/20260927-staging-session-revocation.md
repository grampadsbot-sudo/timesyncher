# Staging session revocation (2026-09-27)

Leaked vacation staging session tokens were deleted from the staging database. Git history was not rewritten. The live staging deployment was not changed.

Live build after this work: `128c9e1781f2f9ce4f0bf2396cf1ccdce136540e` on `https://vacation-staging.timesyncher.com`.

## Tokens

Prefixes only. Each real token is 24 characters and was an `onboarding_sessions.token` value.

| Prefix | Where it was committed |
| --- | --- |
| `2JiKHz` | `evidence/craig-gold-v7-jev-quality-post-intake-20260926-r14/live-transcript.jsonl` on `cursor/jev-quality-r14-evidence-1128` |
| `2Lxex7` | `evidence/...-r19/live-transcript.jsonl` on `cursor/jev-quality-r19-evidence-1128` |
| `4uUC8d` | `evidence/...-r5/live-transcript.jsonl` on the r5, r7–r19 evidence and quality branches that still contain that file |
| `6CTRnW` | `features/collaborator-edits.md` on `cursor/admin-collab-mint-cb2f`, `cursor/postgres-eula-restore-ba1d`, `cursor/tg-start-telegram-rebind-fcc5` |
| `BwQO7h` | older `evidence/...-r5/live-transcript.jsonl` blob, not on any current branch tip |
| `CKEDd0` | `evidence/...-r4/live-transcript.jsonl` on the r4, r5, r7–r19 branches that still contain that file |
| `Ee-cFC` | `evidence/...-r16/live-transcript.jsonl` and `transcript.json` on `cursor/jev-quality-r16-evidence-1128` |
| `MqtQ5E` | `evidence/...-r18/live-transcript.jsonl` on `cursor/jev-quality-r18-evidence-1128` |
| `Q4tk_0` | `evidence/...-r7/live-transcript.jsonl` on `cursor/jev-quality-r7-evidence-1128` |
| `Razti3` | `evidence/...-r11/live-transcript.jsonl` on `cursor/jev-quality-r11-evidence-1128` |
| `VBfuSh` | `evidence/...-r10/live-transcript.jsonl` on `cursor/jev-quality-r10-evidence-1128` |
| `eM7Qdz` | `evidence/...-r12/live-transcript.jsonl` on `cursor/jev-quality-r12-evidence-1128` |
| `klPkT8` | `evidence/...-r6/live-transcript.jsonl` on the r5 and r7–r19 branches that still contain that file |
| `nw9FXF` | `evidence/...-r8/live-transcript.jsonl` on `cursor/jev-quality-r8-evidence-1128` |
| `sqNhxg` | `evidence/...-r15/live-transcript.jsonl` on `cursor/jev-quality-r15-evidence-1128` |
| `tbuFwk` | `evidence/...-r13/live-transcript.jsonl` on `cursor/jev-quality-r13-evidence-1128` |
| `vJRVHR` | `evidence/...-r17/live-transcript.jsonl` on `cursor/jev-quality-r17-evidence-1128` |
| `xeW7gc` | `evidence/...-r9/live-transcript.jsonl` on `cursor/jev-quality-r9-evidence-1128` |
| `TqOYg4` | `features/proof/sct-first-vacation-20260904t034210z/` (`sct-capture.json`, `shared-url-resume.json`, `staging-onboard/onboard-result.json`) on `cursor/sct-staging-onboard-cb2f` |

`sct-pr` (21 characters) appears as a probe query in `features/proof/sct-first-vacation-20260904t034210z/api-probes.json` and `sct-capture.json`. It was not an `onboarding_sessions` row.

No `evidence/...-r2` or `evidence/...-r3` path exists in any fetched ref or historical blob of this repository.

## Revocation

These tokens are stored in `onboarding_sessions.token`. They are not stateless signed cookies, so no signing secret was rotated and the app was not redeployed.

For each 24-character token above:

- Deleted the `onboarding_sessions` row (click rows cascade; other foreign keys set null). Customers, trips, and the other 197 onboarding sessions were left in place.
- Deleted matching `eula_store_objects` and `eula_persistent_store` rows whose key contained the token.
- Replaced leftover copies in metadata, payloads, telegram deep links, and one outbound email body with `[revoked-session]`.

No collaborator-invite or web-access grant hashed to these tokens under the default salts.

## Verification

`GET /api/vacation-itinerary?app=1&session=<token>` is the session check the vacation app uses. Before deletion the 19 real tokens returned 200. After deletion every prefix, including `sct-pr`, returned **404** `Vacation app session not found.`

The same tokens returned **404** from `GET /api/onboarding-session?session=<token>` and `GET /api/eula?action=get-session&sessionId=vacation-<token>`.

This app rejects an unknown session with 404, not 401. That 404 is the rejection. No route change was deployed.

## Other committed secrets

No committed Postgres URL, OpenRouter key, Stripe secret, GitHub token, private key, or Vercel token was found. `sk_live_` / `sk_test_` hits are prefix checks in source, not key material. A `Bearer TIMESYNCHER_ADMIN_TOKEN` string in an SCT receipt is the variable name, not a secret value.

Third-party keys that exist only in the Vercel project env were not rotated.

## Still in git

The token strings remain in branch history and in the evidence files on the branches listed above. This note does not remove them.
