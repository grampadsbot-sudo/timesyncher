50ab6ec72da28113cb5b7ec44f35962db44f6955

Deployed build 50ab6ec72da28113cb5b7ec44f35962db44f6955 on https://vacation-staging.timesyncher.com (deployment timesyncher-vacation-staging-r7qu3ymek).

# Verification table

## Screenshot journey

`scripts/screenshot-journey-pdf.mjs` overwrites `screenshot-journey.pdf`. The real-app gate runs first. The script does not redeem a coupon.

Captured feature files: 31 of 41.
jev-quality-line: PASS. The score line is in the Dialog PDF and the JSONL log. The customer app does not show it.
screenshot-journey.pdf sha256 `01eec5e8341554831c9b0052e15c50fd6dbc221ca43f463a1dfaf8c27a47150d`.

### Not captured

- Purchase email arrival: the inbox copy was not captured
- Email opens the real app (`real-app-email-entry.md`): the purchase email href is still vacation-app.html, not /shared/
- Email click (`post-purchase-email-eula.md`): the purchase email has no /shared/ href to open
- Tyler welcome (`collaborators.md`): the chat has no app bubble containing "Welcome to the trip, Tyler"
- Lauren welcome (`collaborators.md`): the chat has no app bubble containing "officially joining"
- Cursor project contract (`cursor-project-contract.md`): cursor-project-contract.md is a repo file. The shared app has no contract screen.
- Search redesign (`search-redesign.md`): search-redesign.md is a research rule. The shared app has no search screen.
- Flight fields (`flight-fields.md`): KOA arrival did not show Takeoff, Connections, and Layover
- Car fields (`car-fields.md`): SpeediShuttle did not show Rental company and Car type
- Print and PDF (`print-pdf.md`): the header has no Print / PDF menu
- Keepsakes config (`keepsakes-config.md`): The shared header did not open a Print / PDF menu, so there is no Keepsakes Admin panel.
- Order Keepsakes (`order-keepsakes.md`): The shared header did not show an Order Keepsakes control.
- Trip View config (`config-options-trip-view.md`): the header Trip View menu did not list Flights, Hotels, and Cars
- Keepsake Style one (`keepsake-style-one.md`): style=1 did not stay on vacation-staging
- Kimberly collaborator email (`collaborators.md`): Kimberly's invite was not captured from an inbox
- Tyler collaborator email (`collaborators.md`): Tyler's invite was not captured from an inbox
- Lauren collaborator email (`collaborators.md`): Lauren's invite was not captured from an inbox
- Collaborator onboarding emails (`collaborators.md`): Kimberly, Tyler, and Lauren each need a stored sent invite and an arrived copy
