# Issue #485 — declared logo fixture evidence (PR481 gate-b ccab)

## Arthouse Hotel (regenerated)

| Field | Value |
| --- | --- |
| ccabKey | `Arthouse Hotel` |
| website | `https://www.arthousehotelnyc.com/` |
| declared icon | `https://image-tc.galaxy.tf/wipng-diqogu9xx9dzdynxlmw6rahjm/favicon.png` |
| page body SHA-256 | `1311a09ffffe8eb7b54839f6bdb3697ff4b4a21bffd249028ae97ae3450451e7` |
| icon body SHA-256 | `a04b2160e7ffd6a5d8157aab74302dcf6c63eac7cb7623cd18cd2e54508c2112` |
| recording manifest | `2026-10-18T085752Z-arthouse-hotel.json` |

Applied via `scripts/build_nyc_ccab_declared_logos_from_recorded.mjs` and `scripts/regenerate_pr336_search_trip_fixture.mjs`.

Stale guess `https://www.arthousehotelnyc.com/favicon.ico` without declaring HTML is rejected by `effectiveCcabDeclaredLogoUrl` (see `scripts/test_nyc_ccab_declared_logo_recorded.mjs`).

## Zabar's (regenerated, same recording bundle)

| Field | Value |
| --- | --- |
| ccabKey | `Zabar's` |
| recording manifest | `2026-10-18T094200Z-zabars.json` |

Snapshot row 602 and ccab enrichment carry declared logo + `logoProvenance` from recorded official HTML/icon bytes.

## United LAS-EWR flight (not replaced — transport fault)

No recorded official HTML/icon bundle was available in the vk-478 job artifacts on this lane. Live probe on 2026-10-18 against the ccab flight booking URL failed with HTTP/2 stream error before a page body could be captured:

`curl: (92) HTTP/2 stream 1 was not closed cleanly: INTERNAL_ERROR (err 2)`

The ccab row still stores the legacy root favicon guess (`https://www.united.com/favicon.ico`) with no `logoProvenance`. `effectiveCcabDeclaredLogoUrl` correctly returns empty for that row until real declared 200 image evidence is recorded (no favicon guess or blanking in this PR).

## Changed fixture paths

- `scripts/fixtures/nyc_ccab_place_enrichment.json`
- `scripts/fixtures/pr336-vk-search-places.snapshot.json`
- `scripts/fixtures/recorded-ccab-logo-pr481-gate-b/*`
- `scripts/fixtures/nyc-craig-kim-daybyday-trip.mjs` (binds snapshot `sourceRecord` into day-by-day fixture)
