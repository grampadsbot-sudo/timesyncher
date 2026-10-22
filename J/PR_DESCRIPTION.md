Closes #601

## Summary

- Hard round (Gate B fail on `95cb58d9`, run `20261021-235450`): root cause was rounds 1–2 changing `Oe()` `sr` grid axis (`alignItems:"start"`, 28×28 `dc` wrapper, flex/`minHeight:28`), which shifted list-row text vs PR base `e3364ac` and failed Hermes pixel+vision compare on 19 list-tab screens (`~/tsv-dispatch/logs/gateb-verdicts.jsonl`).
- **Revert** those `sr` layout patches; served bundle `index-BKun7ofk.js` again matches base `e3364ac` for list-row markup (pixel parity for merge Gate B). NYC fixture v6 structure (`restore_check.py` on `base-e3364ac` captures) already had zero `logo not centred with name` failures before the layout experiments.
- `#601` on `migrate/trek-source` (≈1px name-line frame) is not fixable on this PR without visible list layout delta vs `e3364ac`; needs a follow-up that does not move row text (e.g. in-chip ink framing), not another `sr` axis change.

## Checks (local)

- `node scripts/rebake_served_trek_bundle.mjs` — 0
- `node scripts/test_itinerary_fresh_daybyday_bundle.mjs` — 0
- `node scripts/test_shared_logo_chip_center_bundle.mjs` — 0
- `node scripts/test_served_trek_bundle.mjs` — 0
- Pre-DONE: `node scripts/check-no-comments.mjs`, `node scripts/test_offline_manifest.mjs`, `BASE=codex/ruling95-consolidated-logo node scripts/check-code-ratchet.mjs` — 0

## Left alone (scope)

- Gate B/capture scripts, baselines, workflows, dependencies.

## Handoff

- GBrain `bot-admin/lanes/vk-pr-handoff/pr-604` — page not found (2026-10-21).
