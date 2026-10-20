# PR #543 lane vkfill-543-20261020100739 (cursor-ubuntu)

## Tip
`870e46967724635a755fbc3850c1c768ac845a31` (matches `origin/vkfill/335-p3a-wiring-202610190827` at lane start; no new commits this round).

## Chief-dr Gate B gaps (head `31b0f587` vs staging `998235c`) — addressed on tip
- **Day-by-Day parity:** airport transfer legs and `Flight option:` titles (`airportTransferLegs.mjs`, `dayTimelinePresentation.mjs`; unit test for Southwest LAS-LGA) in `ac2bc4ec`.
- **List logos:** `logoUrlForPlace` on list + timeline rows (`ListRow.tsx`, `DayTimeline.tsx`, `listTabModel.mjs`) in `ac2bc4ec`.
- **Hotels / stores order:** default price sort for flights/hotels/cars; catalog order for stores/restaurants/events (`CategoryTabScreen.tsx`, `listTabModel.mjs`) in `ac2bc4ec`.
- **Timeline time baseline (ruling 48):** TREK strut line-box (`data-ts-timeline-time` / `data-ts-timeline-time-line`) in `870e4696`.

## Checks (this lane, local)
- `node apps/vacation-client/test/run-all.mjs` (unit; layout skipped — no `CHROME_PATH`)
- `node scripts/check-no-comments.mjs` — pass
- `node scripts/test_offline_manifest.mjs` — pass
- `BASE=codex/ruling95-consolidated-logo node scripts/check-code-ratchet.mjs` — pass (0 fail)
- `node scripts/test_api_route_bundle.mjs` — pass
- `node scripts/test_shared_trip_boot_fetch.mjs` — fails closed: Puppeteer cannot launch Chrome in this lane (no browser binary)

## Not verified here (done means)
- CI green on pushed PR head `870e4696`
- Ubuntu Gate B structure 32/32 on that head

## Left alone (scope)
- Fixtures, baselines, Gate B/capture scripts, `vercel.json`, `vite.config.mjs`, `package.json` / lockfile
