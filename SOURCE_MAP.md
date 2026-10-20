# SOURCE_MAP — Gate B rows 602/605/606/607/610/611 (`Price:` narrative suffix)

Preparation for [#566](https://github.com/grampadsbot-sudo/timesyncher/issues/566) / blocked [#549](https://github.com/grampadsbot-sudo/timesyncher/issues/549) full-description rendering. Base `migrate/trek-source` at `998235cecb967b07d798f314ca072690b1942e11`. No provider calls; no fixture edits in this round.

## What the six rows share

| Row | Gate B name | `NYC_GATE_B_ROW_CCAB_KEYS` | Category |
| --- | --- | --- | --- |
| 602 | Zabar's | `Zabar's` | store |
| 605 | Strand Book Store | `Strand Book Store` | store |
| 606 | Afternoon matinee show | `Afternoon matinee show` | activity |
| 607 | Friend meetup at Bryant Park | `Friend meetup at Bryant Park` | activity |
| 610 | Carbone | `Carbone` | restaurant |
| 611 | Jazz at Lincoln Center | `Jazz at Lincoln Center` | activity |

Each list-row narrative that would surface under #549’s renderer change ends with the same **fixture-authored template tail**: `Price: $NN per person … planning estimate` (regex in `scripts/lib/pr336-stored-narrative-lineage-lib.mjs`). That text is **not** produced by Brave/Tavily/xAI adapters in this trip; `buildGateBSearchPlaceForRow` always sets `source: 'fixture'` and `sourceRecord.ccabInputKind: 'stored_fixture_literal'` (`rawSearchPlaceFromCcab` in `scripts/fixtures/pr336-vk-search-trip-sources.mjs`).

Row **604** (Statue tour) is the contrast case: overlay copy uses `Adults: $26.00` and has **no** `Price:` suffix; it was not in the #549 template-conflict set.

## Data lineage (generation path)

```
scripts/fixtures/nyc_ccab_place_enrichment.json          (base CCAB literals)
        +
scripts/fixtures/pr336-gate-b-ccab-overlay.json          (Gate B row overlays; Price: tails live here)
        +
scripts/fixtures/pr336-gate-b-vk-reviews.json            (review patches)
        → merged in pr336-vk-search-trip-sources.mjs as ENRICHMENT
        → rawSearchPlaceFromCcab({ ccabRecord })
        → enrichSearchPlace()  (src/vacation/trip-thing-enrichment.mjs)
              sourcedLongDescription: copies sourceRecord.description verbatim
              priceFromSourceText: parses numeric price from the same description
        → scripts/fixtures/pr336-vk-search-places.snapshot.json  (checked-in snapshot)
        → NYC dispatch fixture heads under ~/tsv-dispatch/fixture-nyc/heads/<sha>.json
```

**Intro commit for overlay `description` strings (including `Price:` tails):** `b9f4e3e78ecaf73ddcabaff2400cffd77e712277` (`fix(#351): VK search output contract rejects blocker-pass incomplete rows`, 2026-10-13). Provenance guard from #568: `ee2731dc` / merge `998235ce` — `assertPr336GateBSnapshotWriteAllowed` blocks treating these literals as live provider captures.

**Regeneration entrypoint (authorized data round, not run here):** `node scripts/regenerate_pr336_search_trip_fixture.mjs` after overlay/source corrections (`skills/vk-test-fixture-builder/skill`: never hand-patch snapshot without fixing upstream literals).

## Per row: sourced facts vs template label

| Row | Structured `price` (numeric field) | Sourced amounts / quotes inside prose | Template label (fixture tail, not a provider field) |
| --- | --- | --- | --- |
| 602 | 18 | Google ~4.5/5; market/picnic copy from overlay | `Price: $18 per person picnic-supplies planning estimate` |
| 605 | 22 | Google 4.8/5, 14k+ reviews | `Price: $22 per person book-and-gift planning estimate` |
| 606 | 78 | TKTS 20–50% off, $8 service charge (tdf.org) | `Price: $78 per person matinee ticket planning estimate before fees at the booth` |
| 607 | 20 | Bryant Park free; Bryant Park Grill chicken Caesar **$19.50** on public menu | `Price: $20 per person social lunch estimate if you eat before the meetup` |
| 610 | 48 | Google ~4.4/5; carbonenewyork.com hours; Yelp entrees **$24–$54** | `Price: $48 per person dinner planning estimate before tax, tip, and drinks` |
| 611 | 35 | jazz.org/Dizzy's; covers **$20–$65+**; **$25** F&B minimum per jazz.org terms | `Price: $35 per person cover planning estimate plus a $25 per person food-and-beverage minimum…` |

Contract reference: `skills/vk-thing-data-contract/skill` field 5 (`description` / `longDetails`) and field 6 (`price` — per-person estimate, clearly labelled). The **numeric `price` column is the budget field**; the `Price: $… per person … planning estimate` clause is redundant fixture wording baked into field 5 at overlay authoring time.

Base file `nyc_ccab_place_enrichment.json` still holds **older** tails for Zabar's/Strand (different dollar amounts); Gate B rows use **overlay winners** only (`pr336-gate-b-ccab-overlay.json`).

## Gate B `TEMPLATE_RE` vs #549 probe

#549 local probe (`vkfill-549-202610200237-job/source-contract-probe.py`, log at starting HEAD `00c529e2`) reported `Price: ` matches against `TEMPLATE_RE` read from `/home/ubishere9995/tsv-gateb/restore_check.py` (sha256 `d4b26a176a913fe9ea61aa3ed9383dc0bfb085432667a7b76afe713dac9ed7d9` in that receipt).

**Current** checker at the same path (read 2026-10-20): comment Craig 7:59 AM PT 10/20 says `Price:` is not a stock line; `TEMPLATE_RE` is:

`\bDocumented\b.*\boption\b|…|\bWhen:\s|\bBook ahead\b`

A `Price: $18 per person…` string **does not** match that pattern today. `When:` / `Book ahead` still fail. This preparation does **not** change `restore_check.py` (out of repo scope).

## Independent replay (zero provider calls)

```bash
node scripts/probe_pr336_stored_narrative_lineage.mjs
node scripts/test_pr336_ccab_search_provenance.mjs
```

Optional checker read (Ubuntu Gate B tree):

```bash
GATEB_RESTORE_CHECK=/home/ubishere9995/tsv-gateb/restore_check.py node scripts/probe_pr336_stored_narrative_lineage.mjs
```

#549 replay against rendered list descriptions (requires that job’s `rendered-descriptions.json`):

```bash
python3 /home/ubishere9995/tsv-work/vkfill-549-202610200237-job/source-contract-probe.py
```

## Next authorized source/data action (implementation separate)

1. **Edit upstream literals only** in `scripts/fixtures/pr336-gate-b-ccab-overlay.json` (and base CCAB if needed): keep field-6 amounts in structured `price`, move per-person estimates into natural prose **without** the repeated `Price: $… per person … planning estimate` template tail; preserve sourced quotes already in the body.
2. Run `node scripts/regenerate_pr336_search_trip_fixture.mjs` and commit snapshot + dispatch fixture head via the normal fixture-builder process (`skills/vk-test-fixture-builder/skill`).
3. Re-run `node scripts/vk_search_place_source_contract_check.mjs` and Gate B after #549 product/renderer PR lands.

Do **not** scrub `Price:` in UI, relax `TEMPLATE_RE`, or hand-edit `pr336-vk-search-places.snapshot.json` rows for this preparation round.

## Symbols index

| Symbol | File |
| --- | --- |
| `NYC_GATE_B_ROW_CCAB_KEYS` | `scripts/fixtures/pr336-vk-search-trip-sources.mjs` |
| `buildGateBSearchPlaceForRow` | same |
| `rawSearchPlaceFromCcab` | same |
| `enrichSearchPlace` / `sourcedLongDescription` | `src/vacation/trip-thing-enrichment.mjs` |
| `priceFromSourceText` | same (parses `Price: … per person` into numeric `price`) |
| `lineageRows` | `scripts/lib/pr336-stored-narrative-lineage-lib.mjs` |
