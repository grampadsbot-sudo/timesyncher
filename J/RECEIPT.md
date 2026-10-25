# PR #687 vkfill-687 hard round (cursor-ubuntu)

**Start HEAD:** `c3aa1004fde0234a75b6b06db6713f0779362fdc` (verified before edit).

## Root cause (why c3aa1004 still failed)

1. **Hotels Gate B pixel (20261025-224556):** `OE_ROW_TEXT` bound the full long description into the list summary line with unbounded `white-space:normal`, which grew row height (`hotels-390.png` size/aspect drift; `hotels-390-top.png` pixel ratio 0.066).
2. **Budget tab “Add price” despite list prices:** `ha(G)` returned only `thingOverrides` via `tsFillOv`, not merged place fields, so `bi(G)` often missed `place.price` when overrides were empty on the client row object.
3. **Flight list 0/16 priced (coverage):** Harness name segmentation (`gateb_coverage.py` `_segments`) matches fixture titles (e.g. `American Airlines JFK → LAS`) against rendered labels (`Flight option: …`). Capture has `price_text` on rows; not fixed in product (per brief). **Harness fault** for effective flight list price FAIL.

## Source changes (uncommitted; host publish)

| File | Change |
| --- | --- |
| `src/vacation/trek-thing-detail-capture-patch.mjs` | `ha(G)` now `{...G,...tsFillOv(le[Qt(G)],G)}` so budget `bi(G)` / `ha(G).price` see served place prices. |
| `src/vacation/shared-trip-oe-list-row-patch.mjs` | Hotels: `Rn=rr(G)` (short itinerary), `Ld=` long description; summary shows `Ld` with 2-line clamp CSS; upstream/original `Oe()` needles supported. |
| `src/vacation/shared-trip-api-budget.mjs` | Refresh zero `total_price` lines when place has price; drop duplicate unpriced hotel budget lines when a priced line exists for the same name. |
| `public/assets/index-BKun7ofk.js` | Regenerated via same patch modules (not hand-edited minified logic). |

## Tests run (this worktree)

- `node scripts/test_shared_trip_api_budget_lines.mjs` — pass
- `node scripts/test_dossier_staging_fixes_682.mjs` — pass
- `node scripts/test_gate_b_product_row_fields.mjs` — pass
- `node scripts/check-no-comments.mjs` — pass
- `node scripts/test_offline_manifest.mjs` — pass
- `BASE=migrate/trek-source node scripts/check-code-ratchet.mjs` — pass

## NOT RUN (host / pipeline)

- Full Gate B capture + pixel compare on new head (requires host build + `gateb_compare` / `gateb_coverage.py` on candidate capture).
- Managing-dr hotel description judgments for the four “not judged yet” hotels (prerequisite for 80% quality gate; not a coder skip).
- CI on pushed head (host publication only).

## Expected coverage impact (inferred; re-verify on capture)

- Hotel list: long `desc` still in DOM (clamp 2 lines); `rr()` preserved for itinerary role.
- Budget: `ha` merge should surface `place.price` for `Mo` rows → fewer “Add price” lines vs pr687-c3aa100 capture (`22/23` hotel budget unpriced in 20261025-224556 coverage).
- Flights list price FAIL likely unchanged until checker fixture-name alignment (do not rename flight rows in product).

## R8

Not re-run as dedicated R8 replay in this round; `test_gate_b_product_row_fields.mjs` includes pr336 VK binding regression checks — pass at source level.

**Next head:** host commit + push from this dirty tree; then Gate B round on new SHA.
