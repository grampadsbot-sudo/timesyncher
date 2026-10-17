# Thing logos (list + detail)

A Thing logo is the source record URL (`source.logo`, `source.favicon`, or the website favicon from `sourceLogoUrl`) or the row has no logo. Product path: `thingOverrides.logoUrl` via `applyCapturedLogos` / `captureThingLogo` (`src/vacation/thing-logo-capture.mjs`). Pointers are URLs on `thingOverrides.logoUrl` / `place.captured_logo_url` — not Neon logo bytes, not Vercel Blob (those stores are story media).

## Live list rule

- Restaurants, Stores, and The Rest (and Hotels / Cars / Flights) show the **bound logo** for that Thing.
- Fill extras (`__tsLiveFill` / first-pass catalog) get the same named brand path — not category emoji.
- **Admit One / family-event placeholder** (`pDe`) is not used when a `logoUrl` exists.
- Print `_l()` uses the source logo URL and skips `data:image/svg+xml` letter tiles. A name does not select a logo.
- **Airplane glyph** is flights only. A Thing with no source logo has no logo image.

## Blast radius (this fix)

Las Vegas vacation-3 catalog: Carbone / Shake Shack / Eggslut / Lotus / Conservatory / Bellagio stay plus every first-pass restaurant, store, and Rest name (Bellagio Fountains, High Roller, Sphere, Fremont, Neon Museum, Atomic Museum, …).

## Consolidated served logo repair (ruling 95)

The shared route uses the registered header and row patches in the committed TREK bundle. The brand image has equal side tracks. Row title grids reserve the chip height around the first text line. The existing logo painter normalizes readable image ink, and served tabs and the React shell share the composited ink painter. Timeline placement uses the first text line.

Save paths discover icons from an explicit own-site website and persist page/icon provenance or a missing reason. Search and shared serialization do not discover icons. Existing rows require the separately authorized #449 refresh.

Verification is `scripts/test_saved_place_icon_boundary.mjs`, `scripts/test_shared_logo_rendered_geometry.mjs`, shell-layout, and the unchanged full 32-screen Gate B capture. This entry describes the candidate behavior; it is not an acceptance claim.
