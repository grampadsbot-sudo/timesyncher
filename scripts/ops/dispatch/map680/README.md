# Gate B pregate map-box mask (TSV #680)

Staged copies of the Ubuntu host scorer for review before install.

## Install targets

| Staged file | Host path |
| --- | --- |
| `gateb_compare.py` | `~/tsv-gateb/gateb_compare.py` |
| `gateb_pregate_map.py` | `~/tsv-gateb/gateb_pregate_map.py` |
| `gateb_price.py` | `~/tsv-gateb/gateb_price.py` (if not already installed from #671) |

`gateb_compare.py` imports `gateb_pregate_map` from the same directory as the installed compare script.

## Behaviour

For full `daybyday-*.png` shots (not `-top`), the compare masks `capture-regions.json` `map.box` before pixelmatch and vision close calls, matching `restore_check.py` / `restore-check.mjs`. The candidate must still pass the OSM tile + marker evidence rule from structure mode.

`capture-regions.json` is auto-loaded when it sits beside the baseline and candidate PNG directories (the usual `gateb-cand` layout).

## Tests

```bash
python3 -m unittest discover -s scripts/ops/dispatch/map680 -p 'test_*.py'
node scripts/test_gateb_map680_harness.mjs
```
