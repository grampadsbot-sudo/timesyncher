# Shared header chrome

Live shared vacation-3 header in `index-BKun7ofk.js` (`data-trip-view-root` / print-menu root):

- Brand: **TimeSyncher Vacation** + trip title + day count
- **Config Options** (`aria-label`) — icon; text label when that control is selected
- **Record voice note** (`aria-label` / `title`) — live travel HTML inject (`data-ts-shared-audio`); see `voice-note.md`
- **PDFs** (`aria-label`) — icon; text label when selected
- **Order Keepsakes** (`aria-label`) — icon always; text **Order Keepsakes** only when selected (`We==="keepsakes"`)

**Not** on this shared-trip header (do not invent):

- **Change language** / **Select language** — login/landing chrome; see `language.md`
- A header **Expand** / **Fullscreen** button — no such `aria-label` on the shared-trip header. Mapbox map control has **Enter fullscreen** / **Exit fullscreen**; see `maps.md`

Not in this header dump: media toggle, QR toggle.
