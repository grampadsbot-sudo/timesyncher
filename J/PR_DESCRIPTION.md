## Summary

Gate B description judgments flagged **Blue Note Jazz Club** and **Smoke Jazz & Supper Club** as thin (start time + price only). This round binds stored ccab narratives through canonical `externalId` / `ccabKey`, runs Gate B fixture replay through `finalizeServedSharedTripPayload` (same path as live serve), and keeps **#572** flight list `pickFlightListRowSummaryText` / `listRowSubstanceDescription` behavior from **`origin/migrate/trek-source`**.

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
