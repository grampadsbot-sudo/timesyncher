# vkfill-550 receipt (2026-10-21)

## Outcome

Gate B hard round (tier 1): list-row title buttons no longer use `whiteSpace:nowrap` on the outer control so inner name + `data-list-summary` flex can ellipsis inside the 390px grid column (Craig #547). Hotel `je()` stays inline-flex with strong-wrapped names (#592).

## Tip sha

(local commit pending rebake; prior head **c5df7a22**)

## Checks (local)

- `node scripts/rebake_served_trek_bundle.mjs`
- `node scripts/test_shared_tab_list_summary.mjs`
- `node scripts/test_served_trek_bundle.mjs`
- `node scripts/test_itinerary_fresh_daybyday_bundle.mjs`
- Pre-DONE: `check-no-comments`, `test_offline_manifest`, `BASE=migrate/trek-source check-code-ratchet`

## Gate B / look (authority)

- Prior heads **f7d7143** / **c5df7a2** failed structure on PR diff flags (`J/RECEIPT.md` wording) and `overflow-390` NEW vs base **446e1913** (intended ellipsis must pass `look_screen_rules.intended_ellipsis` on re-capture).
- Named logo/timeline/description-quality gaps on NYC fixture are out of scope (#598 / data PRs).

## Host-only offline stops

- `scripts/test_live_transcript_dialog_pdf.mjs:651` — `rules.via` = `gbrain-cli-get_page` (CI uses bundled rules).
- Map marker bounds offline test — no CHROME_PATH on this host.

## CI

Host publishes; CI green on pushed head is authority.
