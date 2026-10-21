## Summary

Gate B capture replays `nyc-shared.json`, where place **5** (`Blue Note`) is a short title without `externalId`, so stored-ccab merge never ran. This round resolves ccab identity by **website host** and a safe **unique name prefix** (`Blue Note` → `Blue Note Jazz Club`), persists `externalId`/`ccabKey` on merge, and sets day-by-day row **611** to **`Jazz at Lincoln Center`** to match the pr336 snapshot. Prior work still finalizes fixture replay through `finalizeServedSharedTripPayload` and keeps **#572** flight list summary behavior.

**Head:** `27037489` — `node scripts/test_stored_ccab_canonical_identity.mjs` and pre-DONE gates pass locally; Ubuntu Gate B not self-certified.

## Verification (local)

```bash
node scripts/test_stored_ccab_canonical_identity.mjs
node scripts/test_list_row_description_substance.mjs
node scripts/test_gate_b_product_row_fields.mjs
cd apps/vacation-client && npm run typecheck && node test/listRows.unit.mjs
node scripts/check-no-comments.mjs && node scripts/test_offline_manifest.mjs && BASE=migrate/trek-source node scripts/check-code-ratchet.mjs
```

## Left alone

Baselines, Gate B checker, and passing judged rows per handoff (Strand, Zabar's, Carbone, etc.).
