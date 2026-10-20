# PR #543 lane vkfill-543-20261020102730 (cursor-ubuntu)

## Tip
`fd297d1cda4446fea840d6aa50cd2683f8846fa5` (detached HEAD in worktree `vkfill-543-20261020102730`; host publish moves `vkfill/335-p3a-wiring-202610190827`).

## Change this round
- **CI typecheck:** `ListSortBar` `SortKey` now includes `catalog` so it matches `CategoryTabScreen` default sort for stores/restaurants/events (fixes GitHub Actions `unit-tests` failure on `0bddde18`, run [39464758319](https://github.com/grampadsbot-sudo/timesyncher/actions/runs/39464758319): `SortKey` not assignable).

## Inherited tip (Gate B parity vs staging `998235c`, chief-dr on `31b0f58`)
- **P3a wiring:** vacation-client bundle on shared-trip routes (`d1b8fcc4`, `scripts/bundle-vacation-client-into-dist.mjs`, `capture/serve-dist.py`).
- **Day-by-Day:** airport legs + flight option titles (`ac2bc4ec`, `airportTransferLegs.mjs`, `dayTimelinePresentation.mjs`).
- **Logos / list order:** `logoUrlForPlace` on list + timeline rows; price sort for flights/hotels/cars; catalog order for stores/restaurants/events (`ac2bc4ec`).
- **Timeline baseline (ruling 48):** TREK strut line-box (`870e4696`).

## Checks (local, tip `fd297d1c`)
- `node scripts/check-no-comments.mjs` — pass
- `node scripts/test_offline_manifest.mjs` — pass
- `BASE=codex/ruling95-consolidated-logo node scripts/check-code-ratchet.mjs` — pass (0 fail)
- `node apps/vacation-client/test/run-all.mjs` — unit pass (layout skipped, no `CHROME_PATH`)
- `npm run build` — pass

## CI / Gate B (not done in lane)
- Prior head `0bddde18`: Actions `unit-tests` **failure** (TS `SortKey`); Vercel contexts **failure** (deployment rate limit, not code).
- Ubuntu Gate B structure 32/32 on published tip — **not run** in this lane; required for done per brief.

## Left alone (scope)
- Fixtures, baselines, Gate B/capture scripts, `vercel.json`, `vite.config.mjs`, `package.json` / lockfile.

## PR description (for host / gh)
**Summary:** Serve the vacation-client React app on shared-trip URLs (P3a) and restore structure parity with staging for day-by-day rows, list logos/order, and single-line timeline baselines. This round fixes CI TypeScript on catalog sort wiring.

**Verify:** `node apps/vacation-client/test/run-all.mjs`, `npm run build`, pre-DONE gates above.

**Out of scope:** Fixture/baseline/Gate B script edits; Vercel rate-limit redeploy is infra, not this diff.
