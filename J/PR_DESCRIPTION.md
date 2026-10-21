Closes #546

## Summary

Host base-merge of `migrate/trek-source` at `e3364ac5` (#598/#599/#600 on base) onto #549 list-row description substance (`stored-ccab-narrative-merge`, `composeListRowDescription` / `tsListRowDescription`). Rebaked `public/assets/index-BKun7ofk.js` from base upstream + product patches.

## Changes (merge `244cb282`)

- **`pr336-vk-search-trip-sources.mjs`**: kept PR stored-ccab exports + base `buildPr336GateBRegenerateRows` / `resolveNycCcabKey` / snapshot materialize.
- **`trip-thing-enrichment.mjs` / `stored-ccab-narrative-merge.mjs`**: hotel ccab list summary from enrichment when substantive; row **608** incomplete-contract list rows omit planning-note/scrape text from live list UI (bundle + server).
- **`shared-trip-live-app-fields.mjs`**: apply stored-ccab merge without leaving stale `longDetails` keys after delete.
- **Tests**: merge conflict fixes (`64` ccab keys; pr225/snapshot binding); `scripts/test_shared_tab_list_summary.mjs` hotel summary pattern.

## Verification (local `244cb282`)

```bash
cd apps/vacation-client && npm test
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser # all lines in scripts/offline-tests.txt
node scripts/check-no-comments.mjs && node scripts/test_offline_manifest.mjs
BASE=migrate/trek-source node scripts/check-code-ratchet.mjs
BASE=codex/ruling95-consolidated-logo node scripts/check-code-ratchet.mjs
```

All exit 0 locally. CI + Gate B on host-pushed head are authority for close.

## Left alone

Baselines, Gate B checker config, workflows, itinerary look (approved). No layout churn beyond merged base + #549 description paths.
