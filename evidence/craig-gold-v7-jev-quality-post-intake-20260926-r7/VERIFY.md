# Verification table

## Screenshot journey

`scripts/screenshot-journey-pdf.mjs` overwrites `screenshot-journey.pdf`. The real-app gate runs first. The script does not redeem a coupon.

Captured feature files: 30 of 41.
jev-quality-line: PASS. The score line is in the Dialog PDF and the JSONL log. The customer app does not show it.
screenshot-journey.pdf sha256 `a43ec894cd69acfd75fbc05e7d2f9458c73699af3b378e5904009d59d65b0f33`.

### Not captured

- Cursor project contract (`cursor-project-contract.md`): cursor-project-contract.md is a repo file. The shared app has no contract screen.
- Search redesign (`search-redesign.md`): search-redesign.md is a research rule. The shared app has no search screen.
- Autonomy bar (`autonomous-app-customer-flow.md`): the shared app has no autonomy bar. A Day-by-Day crop is not that screen.
- Voice note (`voice-note.md`): the shared app has no voice-note screen. A Day-by-Day crop is not that control.
- Telegram intake fill (`tg-intake.md`): the shared app has no Telegram intake screen. The restaurant list is not that fill.
- Flight fields (`flight-fields.md`): KOA arrival did not show Takeoff, Connections, and Layover
- Car fields (`car-fields.md`): SpeediShuttle did not show Rental company and Car type
- Print and PDF (`print-pdf.md`): the header has no Print / PDF menu
- Keepsakes config (`keepsakes-config.md`): The shared header did not open a Print / PDF menu, so there is no Keepsakes Admin panel.
- Order Keepsakes (`order-keepsakes.md`): The shared header did not show an Order Keepsakes control.
- Trip View config (`config-options-trip-view.md`): the header Trip View menu did not list Flights, Hotels, and Cars
- Telegram intake (`tg-intake.md`): The shared app has no Telegram screen. The restaurant list is the website fill intake is supposed to reach, and that list was not on screen.
