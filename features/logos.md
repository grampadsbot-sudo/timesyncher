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
