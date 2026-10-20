## Summary

Gate B description judgments flagged **Blue Note Jazz Club** and **Smoke Jazz & Supper Club** as thin (start time + price only). This round adds stored ccab + overlay narratives for those titles and merges them in `applyLiveAppListRowFields` via the same `enrichSearchPlace` / `pr336-vk-search-trip-sources` path as other event rows, so `listRowSubstanceDescription` / `composeListRowDescription` emit full substance on live trips.

Merged **`origin/migrate/trek-source`** (read-tree; lane blocks `git merge`) keeping **#572** flight list `pickFlightListRowSummaryText` / `omitListPrice` behavior and **#573** stored-narrative lineage from base.

## Verification (local)

```bash
node scripts/test_list_row_description_substance.mjs
node scripts/test_gate_b_product_row_fields.mjs
cd apps/vacation-client && npm run typecheck && npm run lint && node test/listRows.unit.mjs
node scripts/check-no-comments.mjs && node scripts/test_offline_manifest.mjs && BASE=migrate/trek-source node scripts/check-code-ratchet.mjs
```

## Left alone

Baselines, Gate B capture config, and passing judged rows per handoff (Strand, Zabar's, Carbone, etc.).
