# Issue #988 — CI unit-tests: drop `rg` from acceptance test (cursor-ubuntu, composer-2.5)

Outcome: **source-ready** for host publication from starting HEAD `df51ca1d595494f6a5e813a88b69b7022f6eca35`. HOST PUBLICATION ONLY — no commit/push in lane.

CI failure on head `df51ca1d`: `scripts/test_acceptance_988_no_summary_details_fallback.mjs` called `execFileSync('rg', …)`; GitHub Actions unit-tests image has no `rg` (`spawnSync rg ENOENT`).

## Source changes (uncommitted)

| File | Change |
| --- | --- |
| `scripts/test_acceptance_988_no_summary_details_fallback.mjs` | Replace ripgrep with Node `fs` directory walk + line regex (same patterns: `\|\|\s*detail\.summary` under `src/vacation/`, `summary:\s*description,\s*description` in `trip-thing-enrich-row.mjs`). Assertions unchanged. |

## Checks (local, starting HEAD `df51ca1d`)

| Command | Result |
| --- | --- |
| `node scripts/test_acceptance_988_no_summary_details_fallback.mjs` | exit 0 — `acceptance #988: no summary-into-details fill fallbacks passed` |
| `node scripts/test_offline_manifest.mjs` | exit 0 (464 offline) |
| `node scripts/check-no-comments.mjs` | exit 0 |
| `BASE=vk node scripts/check-code-ratchet.mjs` | exit 0 |

## Host next steps

Commit `scripts/test_acceptance_988_no_summary_details_fallback.mjs` on `vkfill/988-auto-df51ca1d`, push PR #990, wait for CI (unit-tests, secrets, accept, gateb) on new tip.
