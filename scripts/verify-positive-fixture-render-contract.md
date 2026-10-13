# Positive fixture render contract (TSV #343)

Harness-only verification that the **source** `apps/vacation-client` preview renders the PR342 `gate-b-nyc-positive-v1` NYC fixture with customer-visible list copy, prices, timeline toggles, budget inventory, and car pickup/return detail.

This is **fixture passability evidence** for the migration source client. It is **not** a Gate B pixel verdict, staging approval, or substitute for the full staging gate.

## Prerequisites

- Root `npm ci` (repo scripts import vacation server helpers).
- `apps/vacation-client` deps (the runner runs `npm ci` there if `node_modules/vite` is missing).
- Chromium at `CHROME_PATH` or `/usr/local/bin/google-chrome` (same as other vacation-client layout tests).

## Run

```bash
cd /path/to/timesyncher
npm ci
node scripts/verify-positive-fixture-render-contract.mjs
```

Optional artifact directory:

```bash
node scripts/verify-positive-fixture-render-contract.mjs --artifact-dir=/tmp/tsv-343-positive-render
```

## What it checks

1. Builds `apps/vacation-client` with its existing Vite config.
2. Serves `vacation-app-next.html` on localhost with intercepted `GET /api/shared/<slug>/` (immutable positive JSON) and read-only edit access.
3. At **390** and **1280** px, for each list tab, enumerates expected rows from `placesForCategoryTab` and asserts each `[data-ts-list-row]` row:
   - `.tsv-row-desc` has **≥30 words**
   - Price text includes the fixture price (including explicit **$0**)
   - Timeline checkbox matches `thingOverrides.timeline` on Flights/Hotels/Cars
4. Budget tab inventory matches `placesForBudget`, and timeline pills match `buildBudgetModel`.
5. Opens the opaque car row detail and asserts **Pickup** / **Return** customer fields mention JFK.
6. Records per-row DOM snippets, source/build git SHAs, full payload byte SHA256 (`98119a045…`, 711352 bytes), and the separate contract projection hash.
7. Re-runs the same DOM predicates on the **short-copy negative** fixture and requires failures (fail-closed).

## Output

Writes `positive-fixture-render-contract.json` under the artifact directory and prints the same JSON to stdout.
