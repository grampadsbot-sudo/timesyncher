VOID
VOID_STALE_BUILD live=ab66dfe6d9f09b5382081f3ac198322a518cd9b4 tip=31c30ff9a9e1affd0eeba1876c31a92f61c8687b
This run is void. Do not grade it.

# Verification table

Deployed build ab66dfe6d9f09b5382081f3ac198322a518cd9b4 on https://vacation-staging.timesyncher.com (deployment timesyncher-vacation-staging-r8otbw1t8, created 2026-09-26 22:40 UTC). r5 code commit 2c511334b1f233de22c22346ab6dba2738d8d26c was not deployed because Vercel returned api-deployments-free-per-day. Missing from that build: defect notes and scores of 3 or lower do not force a rewrite, and the Keep-the-reply note can still ship; a price ask may omit a dollar amount; invented places are not forced into a rewrite; the unlimited upsell is stripped from the post-intake reply; rewrite turns can store a null rewriteModel and null rewrite text; sessionE2eMs on a rewrite can stay 0; a later customer day does not replace the first date, so groceries can leave Fri Apr 3; Thing pages can show joined chat, repeated 4.6 and 4.4 ratings, placeholder review text, and Cars Coming soon; an interim reply is not limited to rewrite turns, and a rewrite is not required to carry a T1 interim.

Hold certify. No merge.

Session prefix `BwQO7hk_`. Trip prefix `cf280544`. Share `intake-cf2805446d5b`. The live replies came from staging commit `ab66dfe6d9f09b5382081f3ac198322a518cd9b4`.

The dialog check refused: turn 3 Jev note is a template. Twenty app notes still use the Keep-the-reply template. The arrival-day reply is the one rewrite turn. It has a T1 interim and a rewrite model, and its sessionE2eMs is 0. Four flagged turns shipped with interim text and a null rewrite model. The post-intake reply has view access, edit access, and the email invite, and it does not contain the unlimited phrase. The price reply names unlimited vacations for the whole year and does not name a dollar amount.

## Screenshot journey

`scripts/screenshot-journey-pdf.mjs` overwrites `screenshot-journey.pdf`. The real-app gate runs first. The script does not redeem a coupon.

Captured feature files: 32 of 40.
jev-quality-line: PASS. The score line is in the Dialog PDF and the JSONL log. The customer app does not show it.
screenshot-journey.pdf sha256 `df4102ef19678fbc0d2b4c435656774fb608a6ca393de97a04262b49d2ab875e`.

### Not captured

- Purchase email arrival: the purchase email HTML was stored and screenshotted. The outbound row status is failed.
- Tyler welcome (`collaborators.md`): the chat has no app bubble containing "Welcome to the trip, Tyler"
- Cursor project contract (`cursor-project-contract.md`): cursor-project-contract.md is a repo file. The shared app has no contract screen.
- Thing logos (`logos.md`): no /ts-thing-logos/ image rendered on a list row
- Flight fields (`flight-fields.md`): KOA arrival did not show Takeoff, Connections, and Layover
- Car fields (`car-fields.md`): SpeediShuttle did not show Rental company and Car type
- Print and PDF (`print-pdf.md`): the header has no Print / PDF menu
- Keepsakes config (`keepsakes-config.md`): The shared header did not open a Print / PDF menu, so there is no Keepsakes Admin panel.
- Order Keepsakes (`order-keepsakes.md`): The shared header did not show an Order Keepsakes control.
- Trip View config (`config-options-trip-view.md`): the header Trip View menu did not list Flights, Hotels, and Cars
