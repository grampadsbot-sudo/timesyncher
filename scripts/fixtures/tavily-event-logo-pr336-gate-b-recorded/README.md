# PR336 Gate B event-logo Tavily recordings (#391)

Replay committed Tavily search payloads for #388 `enrichSearchPlacesWithEventLogos` during fixture build. Refresh on Ubuntu when `TAVILI_API_KEY` is available:

```bash
node scripts/fetch_pr336_gate_b_event_logo_searches.mjs
node scripts/regenerate_pr336_search_trip_fixture.mjs
node scripts/vk_contract_check_local.mjs
node scripts/test_vk_search_place_output_contract.mjs
```

Each file stores the query, raw `tavilyResponse`, and Gate B row metadata. The build step strips hand-bound event `logoUrl` values and re-binds logos from these recordings only.
