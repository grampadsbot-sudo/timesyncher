# Email opens the real app

Canonical: `bot-admin/messages/time-syncher/delete-cli-shell-real-app-only-20260926`.

The purchase email, EULA continue, onboarding, itinerary, and Thing links open the real shared app: Day-by-Day, Vacation Day View timeline bars, and the Detail page. Never the deleted card shell.

## Sub-features

- The email launch href is a `/shared/` itinerary, not the deleted shell cards.

## How to get to it (user POV)

- Open the link in the purchase email.

## Driving it

- Build `purchaseEmail` for a fresh coupon session and open that href on vacation-staging.
- Screenshot `verify-eula.png`.
- Pass when that href is the real shared itinerary.
- If the href is still `vacation-app.html`, the result is a product gap. Do not delete or soften this file.

## Gotchas

- The email href is `/shared/`. The pending EULA capture is still `vacation-app.html?session=`. Those are different URLs.
