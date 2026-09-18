# Record voice note (live travel shared HTML)

Live on `https://travel.timesyncher.com/shared/{token}/` (vacation-3 walk 2026-09-10). **Not** in TREK `index-BKun7ofk.js`. Injected by travel `index.html` for `/shared/` paths only.

- Header button `aria-label="Record voice note"` / `title="Record voice note"` (`data-ts-shared-audio`)
- Inserted between `data-trip-view-root` and `data-print-menu-root`
- Uses `MediaRecorder` + `getUserMedia({ audio: true })`
- POST `/api/shared/{token}/audio-note` with `{ audioDataUrl, durationSeconds }`
- Toasts (exact copy): `Recording...`; `Sending voice note...`; `Voice note queued for this itinerary.`; `Microphone access was blocked.`; size error under ~45 seconds / 4MB

Earlier walk “Requested device not found” is this recorder when the device/mic is missing — not a language-picker invention.

Not a Keepsakes Config toggle. Do not invent extra media/QR switches.

Same injector is now in this repo’s `shared-app.html` so vacation-staging shared UI matches live travel. POST still goes to `/api/shared/{token}/audio-note` (proxied). Do not invent extra media/QR switches.
