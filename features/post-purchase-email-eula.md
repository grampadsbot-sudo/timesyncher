# Post-purchase launch: email, then EULA inside the app

Customer path after coupon redeem or paid checkout. SoT: `bot-admin/messages/time-syncher/post-purchase-email-then-app-eula-20260925`.

Hold certify. This inventory is not a certify.

## Customer path

1. **Purchase-ack UI.** `order-success.html` acknowledges the purchase and tells the customer to check email and click the link in that email. Open App (`#openApp`) and Review Terms go to the same `vacation-app.html?session=…` URL. Terms are accepted in the app, not on this page.
2. **Purchase email.** `purchaseEmail` in `src/vacation/email.mjs` carries the launch link. The link is `vacationAppLink` (`/vacation-app.html?session=…`). It does not link `/shared/intake-…`.
3. **EULA first screen of the app URL.** `vacation-app.html` paints Review Terms & Privacy (`#eulaScreen`, Agree) when `eula.accepted` is not true. Acceptance posts to `/api/eula?action=accept` from that screen.
4. **Onboarding chat.** After Agree, a customer with no vacation site is chat-only. No trip website is shown until their first vacation site exists.

## Retired customer path

Do not drive or cite these as the customer launch:

- Purchase email or order-success links to `/shared/intake-…`
- Order-success EULA section / `#acceptEula`
- Standalone `/accept/{session}` as the screen the purchase email opens

`/accept` remains a legacy route. It is not the post-purchase customer path. Collaborator website-edit accept links are a different flow (`collaborators.md`).
