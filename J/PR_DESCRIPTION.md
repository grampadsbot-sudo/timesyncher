Closes #536

## What changed and why

PR #532 merged logo re-enrichment (`src/vacation/logo-reenrichment.mjs`, `scripts/test_logo_reenrichment.mjs`) without the audit table migration from superseded PR #526. This adds the missing `db/migrations/009_trip_thing_logo_audit.sql` only, byte-identical to `dr/logo-operator-salvage-20261018`.

## Checks run (head `5f08ec2e`, feat `0f80adda`)

| Command | Result |
|---------|--------|
| `git diff --stat 11586755..HEAD` | one file: `db/migrations/009_trip_thing_logo_audit.sql` (+14) |
| sha256 vs `dr/logo-operator-salvage-20261018` | `2f0aa515f1a09ac2f0466c4a67142ffb6630699ef3b89766d9f9fbf022c01aea` (match) |
| `node scripts/test_logo_reenrichment.mjs` | 8/8 pass |
| `node scripts/check-no-comments.mjs` | passed (795 files) |
| `node scripts/test_offline_manifest.mjs` | offline manifest ok (279 offline, 17 online) |
| `BASE=dr/logo-snapshot-binding-20261018 node scripts/check-code-ratchet.mjs` | passed (255 report, 0 fail) |

GitHub Actions: https://github.com/grampadsbot-sudo/timesyncher/actions/runs/39463303099 — `unit-tests` and `secrets` success on prior head `32ea8269`; run https://github.com/grampadsbot-sudo/timesyncher/actions/runs/39464750194 on `5f08ec2e` pending at lane handoff. Backend-only diff (no UI files). Vercel deployment statuses on `5f08ec2e` are rate-limited (infra, not unit-tests).

## Left alone (scope)

Baselines, Gate B/capture, `.github/`, `vercel.json`, `package.json`, re-enrichment application code, offline manifest list. No migration applied to any database (host-applied only).
