# vkfill-550 receipt — PR #550 feature parity follow-up (Gate B round 16)

## Outcome

**source-ready** on start HEAD **84e351f4561c2487a839b86ae503eaa2fe3e8e8c** (verified before edit).

## Root cause (Gate B round 16 still `feature parity vs staging` on 84e351f)

Round 16 CI green on **84e351f** (`~/tsv-dispatch/logs/gateb-verdicts.jsonl` sha **84e351f**, round **16**, verdict **FAIL**, failing **feature parity vs staging**). Persist-across-tabs fix was directionally correct, but **1280px** staging reference (`~/tsv-gateb/runs/20261101-014617/gap-close/gap-587/_v6-*-1280-top.json`) requires header controls `Remove 🚗 Dollar JFK`, `Remove 🚗 Hertz JFK`, `Remove 🚗 Priceline opaque Standard seda` (40-char capture), `Remove 🚗 Thrifty JFK` after the Cars tab pass. **390-top** shots pass without those controls (staging ref has empty car-remove inventory at 390). The **84e351f** script labeled Priceline as `Priceline opaque JFK`, which fails `restore_check.feature_parity` prefix match against staging’s `Priceline opaque Standard sedan` label (simulated with `~/tsv-gateb/restore_check.py` on `_v6-cars-1280-top.json`).

## Change (host publish)

| Path | Why |
| --- | --- |
| `public/ts-car-brand-filter.js` | Keep **84e351f** persist-across-tabs behavior; fix brand strings: Priceline rows use the list-row title as-is (no `JFK` suffix); other JFK cars still `{name} JFK`; vk-style `innerText` fallback before `$`; remount on Budget tab click so bar stays warm through capture order. |

Untouched: row layout patch, `public/assets/index-BKun7ofk.js`, tests, baselines, Gate B config.

## Checks (local)

| Command | Exit | Ref |
| --- | --- | --- |
| `node scripts/check-no-comments.mjs` | 0 | |
| `node scripts/test_offline_manifest.mjs` | 0 | |
| `BASE=vk node scripts/check-code-ratchet.mjs` | 0 | 255 report, 0 fail |
| `node scripts/test_real_app_entry.mjs` | 0 | |
| `cd apps/vacation-client && npm test` | 0 | |

Full `scripts/offline-tests.txt` sweep not re-run this round (lane time); host should run before push if required.

## Uncommitted (host only)

- `public/ts-car-brand-filter.js`
- `J/RECEIPT.md` (this file)

Authority: host commit + push → CI + Gate B structure on pushed head (not Cursor self-proof).
