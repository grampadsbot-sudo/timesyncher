## Summary

Closes #571. Long stored Thing summaries (>20 words) no longer leave flight list rows without a `data-list-summary` line: live bundle `rr()` uses the same clause-based short-line picker as enrichment (`pickListRowSummaryText` / `listRowSummaryPickBundleExpr`).

## What changed

- `src/vacation/trip-thing-enrichment.mjs` — `pickListRowSummaryText`, `listRowSummaryPickBundleExpr` for clause picking (≥6 words, ≤120 chars).
- `src/vacation/trek-thing-detail-fields-patch.mjs` — patch upstream `rr()` to run the picker on itinerary note then summary.
- `scripts/test_trip_thing_logo_metadata.mjs` — regression for long flight summary text.
- `public/assets/index-BKun7ofk.js` — rebaked so committed served bundle matches `renderServedTrekBundle` after the `rr()` patch (`217aeb55`).

## Verification (lane worker)

```text
node scripts/check-no-comments.mjs
node scripts/test_offline_manifest.mjs
BASE=codex/ruling95-consolidated-logo node scripts/check-code-ratchet.mjs
node scripts/test_trip_thing_logo_metadata.mjs
node scripts/test_gate_b_product_row_fields.mjs
node scripts/test_served_trek_bundle.mjs
node scripts/rebake_served_trek_bundle.mjs
```

All exited 0 on the lane worker at tip `217aeb55406b6c41a9f14470dc55e78b8e52a1aa`.

CI: `unit-tests` + `secrets` success on PR head `4f2c17c` — https://github.com/grampadsbot-sudo/timesyncher/actions/runs/39461921661 (rebake `217aeb55` fixed prior `62b226c4` `test_served_trek_bundle.mjs` failure).

## Left alone (scope)

Baselines, Gate B/capture harness, workflows, `scripts/offline-tests.txt`, NYC fixture text, dependencies, deploy config.
