# Shared header chrome

Live shared vacation-3 header in `index-BKun7ofk.js` (`data-trip-view-root` / print-menu root):

- Brand: **TimeSyncher Vacation** + trip title + day count
- **Config Options** (`aria-label`) — icon; text label when that control is selected
- **PDFs** (`aria-label`) — icon; text label when selected
- **Order Keepsakes** (`aria-label`) — icon always; text **Order Keepsakes** only when selected (`We==="keepsakes"`)

Shared-trip header hero row has no microphone (#865). Voice input stays on the vacation app composer (`#voiceButton`); see `voice-note.md` for legacy travel HTML inject paths.

**Not** on this shared-trip header (do not invent):

- **Change language** / **Select language** — login/landing chrome; see `language.md`
- A header **Expand** / **Fullscreen** button — no such `aria-label` on the shared-trip header. Mapbox map control has **Enter fullscreen** / **Exit fullscreen**; see `maps.md`

Not in this header dump: media toggle, QR toggle.

Vacation app splitter (#959, `vacation-app.html`, not the shared-trip header): the 54×3 pill sits on a 22px gray bar (`#splitterTrack`) at 480px and narrower, and on coarse-pointer touch screens up to 932px. The whole 44px row (`#splitterRow`) stays the drag target.
