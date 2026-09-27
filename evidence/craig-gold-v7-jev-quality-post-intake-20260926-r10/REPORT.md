# r10 Jev quality

Deployed build `8c026448c865df5874399539ea93ae2f9f4d4c0a` on https://vacation-staging.timesyncher.com (deployment timesyncher-vacation-staging-7z7u16utt). Live `/api/version` matches that tip. The screenshot journey is stamped with that build.

Function count: 1 (`api/[...route].func`).

Local curls: `GET /` 200, `GET /assets/index-BKun7ofk.js` 200, `GET /api/shared/las-vegas-vacation-3` 200, `GET /api/vacation-itinerary?app=1` 400, `GET /api/version` 200.

Live curls: `GET /` 200, `GET /assets/index-BKun7ofk.js` 200, `GET /api/shared/las-vegas-vacation-3` 200, `GET /api/vacation-itinerary?app=1` 400, `GET /api/version` 200.

The purchase email shows `https://vacation-staging.timesyncher.com/shared/intake-aecb7bed982f/` as visible text. The initial itinerary in the journey is that live shared trip.

The dialog PDF was not written. `scripts/live-transcript-dialog-pdf.mjs` exited 1 with `refused: turn 25 price question has no per-payer dollar price`. Turn 25 names the plan unlimited vacations for the whole year and says who pays in prose. It does not include the per-payer dollar line, and it says the plan covers the whole group, including Fallon. The rewrite of that turn was logged and rejected as near the draft, so the draft shipped flagged.

Session wall time is 185375ms. Gen-only median is 3940ms. The v6 gen-only p50 of 28834ms is 7.32× this session's gen-only median. Real per-turn latency median is 8167ms. Mean quality on the 24 generated turns is 2.500 (histogram 5×0, 4×3, 3×9, 2×9, 1×3). Fourteen turns logged a rewrite attempt. Two of those shipped. Twelve shipped the draft flagged. None came back empty.

Generated turns log `jevNote: null` and `jevNoteReason: jev_no_free_text`. Jev returned a score and no free-text note. The stored rewrite attempts include the text, model, score, milliseconds, and error.

The opener is `Welcome. I am here to build this vacation with you.` Turn 3 offers unlimited vacations for the whole year as a plan they can take. It does not say the plan is already set up. Gardens are Sun Apr 5 and Thu Apr 9. Town walk is Thu Apr 9. Swims are Mon Apr 6 and Fri Apr 10. Dinner is Fri Apr 10. Arrival day Fri Apr 3 has no swim. Turn 19 places the Friday April 10 dinner with the party of eight and does not call it night seven. Turn 21 names Craig, Kimberly, Tyler, Lauren, Torren, Peyton, Keegan, and Fallon, and does not count Aunt Jean in that eight. Groceries are at 74-5594 Palani Rd, Kailua-Kona. Kimberly, Tyler, and Lauren each have a Welcome aboard line in the chat. The voice note crop shows the microphone. Order Keepsakes and the car fields are gaps, not captures.

## Uncapturable on staging

These surfaces are not on the shared trip. Each line is the gap reason and what would unblock a capture.

- Cursor project contract: No contract screen exists in the shared app. Unblock: a contract page on the shared trip.
- Search redesign: Search redesign has no customer screen on the shared trip. Unblock: a search box on the shared trip.
- Autonomy bar: The shared app has no autonomy bar. Unblock: mount that bar on the shared trip.
- Flight fields: KOA arrival does not render Takeoff, Connections, and Layover. Unblock: those fields on the open flight detail.
- Car fields: SpeediShuttle shows the shuttle summary and does not render Rental company and Car type. Unblock: those two fields on the open car detail.
- Print and PDF: The header PDFs control did not open a Print / PDF menu. Unblock: mount that menu on vacation-staging.
- Keepsakes config: Keepsakes setup did not open. Unblock: a Keepsakes menu with Style one, Style two, and Admin on this host.
- Order Keepsakes: Order Keepsakes did not open a panel of its own, so the shot would still be the thing page. Unblock: an order panel that replaces the thing page.
- Trip View config: Config Options did not open Trip View. Unblock: mount Config Options with Flights, Hotels, and Cars on this host.
- Telegram intake: The shared app has no Telegram intake screen. Unblock: a Telegram intake view on the shared trip.

Hold certify. No merge.
