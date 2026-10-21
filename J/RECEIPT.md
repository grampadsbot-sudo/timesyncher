# vkfill-550 receipt (2026-10-21)

## Outcome

Base-merge round 2 at **1874c491** (merge `migrate/trek-source` **446e1913** into **13ad272f**): `<strong>` name line (#592) + same-line description at all widths (#547).

Auto round: hotel list title row uses **inline-flex** (not full-width grid) so long hotel name + price + inline summary stay within 390px without horizontal overflow.

## Tip sha

See DONE line after final commit.

## Checks (local)

- `cd apps/vacation-client && npm test` — pass (layout chrome skipped: no CHROME_PATH)
- `node scripts/rebake_served_trek_bundle.mjs` — sha256 `1e9ffe8b0d5646c8b7b89e48f7545802c44ba577882aa7b21b2a3560abe0b77e`
- `node scripts/test_shared_tab_list_summary.mjs` — pass
- `node scripts/test_served_trek_bundle.mjs` — pass
- `node scripts/test_itinerary_fresh_daybyday_bundle.mjs` — pass
- `node scripts/test_gate_b_live_tab_logo_rows.mjs` — pass
- Pre-DONE: `check-no-comments`, `test_offline_manifest`, `BASE=migrate/trek-source check-code-ratchet`, `BASE=codex/ruling95-consolidated-logo check-code-ratchet` — pass

## Gate B / look (authority)

- Gate B structure **PASS** on **1874c491** (`~/tsv-dispatch/logs/gateb-verdicts.jsonl` round 5, 2026-10-21T14:36:20-07:00).
- `look_screen_rules.py` on `gateb-cand/pr550-1874c49` still fails description/price coverage (fixture data; #549 / #580), not layout-only.

## Host-only offline stops

- `scripts/test_live_transcript_dialog_pdf.mjs:651` — `rules.via` = `gbrain-cli-get_page` (CI uses bundled rules).
- Puppeteer offline tests (e.g. `test_day_by_day_map_marker_bounds_chrome.mjs`) — no Chrome on this host.

## CI

Host publishes; CI green on pushed head is authority.
