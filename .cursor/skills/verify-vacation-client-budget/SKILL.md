---
name: verify-vacation-client-budget
description: Rerun unit and layout checks for the preview vacation client Budget tab (NYC PR225 fixture at 390 and 1280).
---

# Verify vacation client — Budget tab

Preview entry: `vacation-app-next.html?token=<slug>#budget`.

## Commands

From repo root:

```bash
node apps/vacation-client/test/budget.unit.mjs
cd apps/vacation-client && npm run build && cd ../..
node apps/vacation-client/test/budget-layout.mjs
```

Layout checks need Chromium at `CHROME_PATH` (CI: `/usr/local/bin/google-chrome`) and `puppeteer-core` on `NODE_PATH` (online chrome suite).

Artifacts: `evidence/vacation-client-p2-4-budget/budget-390.png` and `budget-1280.png`.

## What passes

- Budget derivation: bucket totals, hotel stay totals vs per-night, saved `__budgetTargets`.
- NYC fixture: no horizontal overflow, budget row logo vertical center ≤ 0.5px, BUD amount scrape (no stray `$`), completeness score all green.
