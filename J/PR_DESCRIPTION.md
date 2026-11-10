Closes #901

## Summary

Replaced three trip 99 stand-in bundle Things with single real venues in the PR336 snapshot and Gate B NYC staging fixture, using VK Search dossiers (664→Big Apple Greeter, 669→Birdland Jazz Club, 672→e’s BAR). Added a trip 99 stand-in checker (multi-venue ` / ` titles, legacy generic walking-tours title, street-address guard for ids 664/669/672) wired into capture pre-data check, with offline regression tests.

## Test plan

- [x] `node scripts/test_issue_901_trip99_single_venue_standins.mjs`
- [x] `node scripts/test_gate_b_capture_pre_data_check.mjs`
- [ ] Host: `node scripts/test_offline_manifest.mjs` after offline-tests registration
- [ ] CI on PR head
- [ ] Gate B on visible screens (if any change outside fixture-only data paths)

## Scope notes

Did not change live replay JSON (`nyc-screen-trip99-live-shared-api.json`), other candidate-bundle rows, or #889 hotel addresses.
