# NYC day-by-day fixture media

Committed JPEGs for the `nyc-craig-kim-june-2026` shared-trip harness. The QR asset is generated locally for scan tests and is unchanged from prior rounds.

## `uws-street-photo.jpg`

- **Subject:** Zabar's storefront, Upper West Side (bound to the Day 1 Zabar's row).
- **Source:** [File:Zabars Broadway jeh.jpg](https://commons.wikimedia.org/wiki/File:Zabars_Broadway_jeh.jpg)
- **License:** [Creative Commons CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/) (public domain dedication). Photographer: Jim.henderson.
- **Local edit:** Resized to 320×240 JPEG for fixture thumbnails.

## `lincoln-center-photo.jpg`

- **Subject:** Statue of Liberty (bound to the Day 2 Statue of Liberty walking tour row; filename kept for stable fixture URLs).
- **Source:** [File:Statue of Liberty 7.jpg](https://commons.wikimedia.org/wiki/File:Statue_of_Liberty_7.jpg)
- **License:** Public domain (per Wikimedia Commons file page).
- **Local edit:** Resized to 320×240 JPEG for fixture thumbnails.

## `video-scan-qr.png`

- Local QR code image for the Day 2 video binding (not from Wikimedia).

## Stored one-line descriptions (day-by-day gate fixture)

Editable copy for timeline/list rows is **not** invented at render. It lives on each place’s thing override:

- **Field path:** `thingOverrides[place:<placeId>].summary` (served to the live bundle as `ha(place).summary`, read in UI via `rr(place)`).
- **Fixture source:** `scripts/fixtures/nyc-craig-kim-daybyday-trip.mjs` → `SUMMARIES` map keyed by place id (601–607).
- **Conflict day:** Day 3 (`NYC_CONFLICT_DAY`) includes overlapping rows 606/607 with the same stored `summary` field on each override.
