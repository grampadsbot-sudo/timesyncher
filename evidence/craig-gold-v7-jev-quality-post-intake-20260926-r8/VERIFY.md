# Verification table

## Screenshot journey

`scripts/screenshot-journey-pdf.mjs` overwrites `screenshot-journey.pdf`. The real-app gate runs first. The script does not redeem a coupon.

Captured feature files: 32 of 41.
jev-quality-line: PASS. The score line is in the Dialog PDF and the JSONL log. The customer app does not show it.
screenshot-journey.pdf sha256 `01fdc32324dafef3ff935876bd00636e51c9735363f9d32486f07f8e562d9e47`.

### Not captured

- Cursor project contract (`cursor-project-contract.md`): cursor-project-contract.md is a repo file. The shared app has no contract screen.
- Search redesign (`search-redesign.md`): search-redesign.md is a research rule. The shared app has no search screen.
- Autonomy bar (`autonomous-app-customer-flow.md`): the shared app has no autonomy bar. A Day-by-Day crop is not that screen.
- Flight fields (`flight-fields.md`): KOA arrival did not show Takeoff, Connections, and Layover
- Car fields (`car-fields.md`): SpeediShuttle did not show Rental company and Car type
- Print and PDF (`print-pdf.md`): the header has no Print / PDF menu
- Keepsakes config (`keepsakes-config.md`): The shared header did not open a Print / PDF menu, so there is no Keepsakes Admin panel.
- Trip View config (`config-options-trip-view.md`): the header Trip View menu did not list Flights, Hotels, and Cars
- Telegram intake (`tg-intake.md`): The shared app has no Telegram screen. The restaurant list is the website fill intake is supposed to reach, and that list was not on screen.
