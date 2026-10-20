## Summary

Gate B description judgments flagged **Blue Note Jazz Club** and **Smoke Jazz & Supper Club** as thin (start time + price only). This round adds stored ccab + overlay narratives for those titles and merges them in `applyLiveAppListRowFields` via the same `enrichSearchPlace` / `pr336-vk-search-trip-sources` path as other event rows, so `listRowSubstanceDescription` / `composeListRowDescription` emit full substance on live trips.

Prior **7dd5ef04** work is unchanged: list rows still use `omitListPrice` + flight clip; Gate B contract still uses full substance descriptions.

## Verification (local tip `52237d9c`)

```bash
node scripts/test_list_row_description_substance.mjs
node scripts/test_gate_b_product_row_fields.mjs
cd apps/vacation-client && node test/listRows.unit.mjs
node scripts/check-no-comments.mjs && node scripts/test_offline_manifest.mjs && BASE=migrate/trek-source node scripts/check-code-ratchet.mjs
```

All passed locally.

## Left alone

No baseline, Gate B capture, or `pr336-vk-search-places.snapshot.json` edits. `migrate/trek-source` merge deferred to host (lane shell blocked `git merge`); Jazz at Lincoln Center and other passing judged rows untouched.
