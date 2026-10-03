# Post-purchase email, then in-app EULA

After purchase or coupon redeem, the customer reads an acknowledgement, opens the purchase email, accepts terms on the first screen of the app URL, and lands in onboarding chat.

## Sub-features

- `purchase-ack` shows purchase confirmed and tells the customer to click the link in the email. No primary Open App control.
- `purchase-email` carries the launch link to `/shared/…`. It is not `vacation-app.html`, order-success, or `/accept`.
- `app-eula-first` is the pending app URL (`vacation-app.html?session=`) with Review Terms & Privacy and Agree before the workspace. That capture is not the email's `/shared/` href.
- `onboarding-chat` is the app shell after Agree. Layout is only `features/screens/app.md`.

## How to get to it (user POV)

- Finish coupon redeem or paid checkout. The browser lands on `order-success.html?session=`.
- Open the purchase confirmation email. Use the Open TimeSyncher Vacation link in that email.
- There is no customer step that starts at `/accept` or at an Open App button on order-success.

## Driving it with verify-post-purchase-email-eula

Preconditions:

- `--doctor` reports `doctor ok` before `--live`.
- The evidence directory contains the purchase email and `browser-notes.json` from a redeem whose EULA was still pending at first open.

- **Ack the purchase.** Open the order-success URL from the redeem. Run `node .cursor/skills/verify-timesyncher-vacation/scripts/verify-post-purchase-email-eula.mjs --evidence <dir>`. The order-success step has no buttons and its text tells the customer to check email.
- **Read the email.** The harness reads `purchase-email.html` or `purchase-email.txt`. The launch href includes `/shared/` and is not `vacation-app.html`, order-success, or `/accept`.
- **EULA first.** The `eula-first` note is the pending app URL `vacation-app.html?session=`, `#eulaScreen` is present, and the workspace is absent. It is a different URL from the email launch.
- **Agree.** The `onboarding` note is the same app URL, EULA is gone, and the workspace is the app shell in `features/screens/app.md`.
- **Fail closed.** `--self-check` must exit non-zero for a missing email, an email that links to order-success, and an email that links to `/accept`.

## Gotchas

- Reopening an app URL after Agree shows chat, not the EULA. First-paint proof has to come from the pending session capture.
- The words "open TimeSyncher Vacation" inside the email-ack sentence are not an Open App button. Fail on `#openApp` or a button named Open TimeSyncher Vacation.
- Collaborator `/accept` links are a different flow. They do not satisfy this path.
- After the trip has a shared site, the workspace iframe is the real itinerary (`/shared/…`). The deleted Onboarding/Itinerary cards are not this feature.
- A screenshot of order-success EULA without the purchase email is a failed drive.
