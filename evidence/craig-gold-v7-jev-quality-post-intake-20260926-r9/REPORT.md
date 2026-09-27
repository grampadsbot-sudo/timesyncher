# r9 Jev quality

Deployed build `e50349c1c6fb0211dfffa2f2159622f3361f4d2e` on https://vacation-staging.timesyncher.com (deployment timesyncher-vacation-staging-3vr0q7t04). Live `/api/version` matches that tip. Both PDFs are stamped with that build.

Function count: 1 (`api/[...route].func`).

Local curls: `GET /` 200, `GET /assets/index-BKun7ofk.js` 200, `GET /api/shared/las-vegas-vacation-3` 200, `GET /api/vacation-itinerary?app=1` 400, `GET /api/version` 200.

Live curls: `GET /` 200, `GET /assets/index-BKun7ofk.js` 200, `GET /api/shared/las-vegas-vacation-3` 200, `GET /api/vacation-itinerary?app=1` 400, `GET /api/version` 200.

The purchase email shows `https://vacation-staging.timesyncher.com/shared/intake-289d380b52b8/` as visible text. The initial itinerary in the journey is that live shared trip.

The dialog cover is Big Island v7. Session wall time is 241390ms. Gen-only median is 3775ms. The v6 gen-only p50 of 28834ms is 7.64× this session's gen-only median. Real per-turn latency median is 9062ms and counts both Jev calls on a rewrite turn. The dialog prints `jev ran` 24 times, once per generated turn, using the judge's own milliseconds.

The opener is the gold line, `Welcome. I am here to build this vacation with you.` Gardens are Sun Apr 5 and Thu Apr 9. Town walk is Thu Apr 9. Swims are Mon Apr 6 and Fri Apr 10. Dinner is Fri Apr 10. Arrival day Fri Apr 3 has no swim. The price reply is `Kimberly $27, paid by you; Tyler $27, paid by Tyler; Lauren $27, paid by Lauren`.

Car fields is a captured page. Eight surfaces are exempt: contract, search, autonomy, flight, Print/PDF, keepsakes setup, Trip View setup, and Telegram intake. Keepsake Style one stays open: style=1 did not stay on vacation-staging.

Hold certify. No merge.
