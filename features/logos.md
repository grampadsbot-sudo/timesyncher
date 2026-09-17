# Thing logos (list + detail)

Bound brand marks on every Thing row. Product path: `thingOverrides.logoUrl` via `applyCapturedLogos` / `captureThingLogo` (`src/vacation/thing-logo-capture.mjs`). Files live in `/ts-thing-logos/`.

## Live list rule

- Restaurants, Stores, and The Rest (and Hotels / Cars / Flights) show the **bound logo** for that Thing.
- Fill extras (`__tsLiveFill` / first-pass catalog) get the same named brand path — not category emoji.
- **Admit One / family-event placeholder** (`pDe`) is not used when a `logoUrl` exists.
- Print `_l()` prefers named `tsLogo(mr(G))` `/ts-thing-logos/*.svg` over bound `logoUrl`, and skips `data:image/svg+xml` letter tiles.
- Bound SVG files are **pictorial brand marks**, not Georgia-serif monogram tiles or generic shopping-bag icons.
- **Airplane glyph** is flights only. Missing car/transport logos use `/ts-thing-logos/car.svg`, never ✈️.

## Blast radius (this fix)

Las Vegas vacation-3 catalog: Carbone / Shake Shack / Eggslut / Lotus / Conservatory / Bellagio stay plus every first-pass restaurant, store, and Rest name (Bellagio Fountains, High Roller, Sphere, Fremont, Neon Museum, Atomic Museum, …).
