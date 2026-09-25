# Post-purchase launch: email, then EULA inside the app

Customer path after coupon redeem or paid checkout. SoT: `bot-admin/messages/time-syncher/post-purchase-email-then-app-eula-20260925`.

Hold certify. This inventory is not a certify.

## Customer path

1. **Purchase-ack UI.** `order-success.html` acknowledges the purchase and tells the customer to check email and click the link in that email. There is no primary Open App button.
2. **Purchase email.** `purchaseEmail` in `src/vacation/email.mjs` carries the launch link. The link is `vacationAppLink` (`/vacation-app.html?session=…`).
3. **EULA first screen of the app URL.** `vacation-app.html` paints Review Terms & Privacy (`#eulaScreen`, Agree) when `eula.accepted` is not true. Acceptance posts to `/api/eula?action=accept` from that screen.
4. **Onboarding chat.** After Agree, the empty workspace shows `no vacations yet`, chat-only, with no mode dropdown.

## Retired customer path

Do not drive or cite these as the customer launch:

- Order-success **Open TimeSyncher Vacation** / `#openApp` / `vacation_app_open`
- Order-success EULA section / `#acceptEula`
- Standalone `/accept/{session}` as the screen the purchase email opens

`/accept` remains a legacy route. It is not the post-purchase customer path. Collaborator website-edit accept links are a different flow (`collaborators.md`).
