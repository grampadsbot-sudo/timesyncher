# PR336 Gate B xAI grok-4.3 recordings (#366)

Run on Ubuntu (or any host with `XAI_API_KEY` from OpenClaw secrets — never log the key):

```bash
node scripts/fetch_pr336_gate_b_xai_place_ratings.mjs
node scripts/build_pr336_gate_b_vk_reviews_from_xai_recorded.mjs
node scripts/regenerate_pr336_search_trip_fixture.mjs
node scripts/vk_contract_check_local.mjs
node scripts/test_vk_search_place_output_contract.mjs
```

Each fetch writes a timestamped JSON file here with the raw xAI `payload` and parsed `structuredText`. The build step picks the newest file per ccab key and regenerates `pr336-gate-b-vk-reviews.json` without `ratingMix` or branded review sources.

Places without a recording stay empty with `missingFields: ["ratings","reviews"]` (never hand-written numbers or prose).
