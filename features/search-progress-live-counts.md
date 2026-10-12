# Live search progress counts (customer app)

SoT: `bot-admin/messages/time-syncher/tsv-ui-spec` (Craig 2026-10-12 ~09:18 PT).

While a trip search/job runs, the vacation app shows compact rows such as **Restaurants 12** and **Hotels 6** in the website pane (top split region). Counts refresh from real unique results at most once per second; a row appears when that type first has a nonzero count; only the number nodes update in place. Then **Building itinerary…** while assembly runs, then the trip website replaces the temporary progress when trip data and the embed are ready. Composer, header, and full-screen rules stay as in `features/screens/app.md`.

Producer: `src/vacation/search-progress.mjs`, trip metadata `searchProgress`, hooks on place search partial snapshots, trip thing inserts, and site URL assignment. Client: `vacation-app.html` polls `GET /api/vacation-itinerary?app=1` at 1 Hz during active progress.

Verification: `scripts/test_search_progress_flow.mjs` (offline acceptance reducer/producer contract).
