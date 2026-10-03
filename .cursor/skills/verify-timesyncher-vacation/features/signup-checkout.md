# Signup and checkout

The public entry at `/`. The form fields are `input[name="firstName"]` and the rest of that form, including `input[name="couponCode"]`. Submitting the form takes payment or redeems a coupon. This drive does not submit it.

## Sub-features

- `form` — the signup form is on the page at 390x844 and 1280x800, with no element wider than the viewport and the header at the top when a header is painted.
- `coupon` — redeem a staging coupon and land in the app. Verified-unreachable until Product documents a disposable coupon.

## How to get to it (user POV)

- Open `https://vacation-staging.timesyncher.com/`.
- Fill the contact form, then pay or enter a coupon. The coupon path is one-way. This map does not name a coupon that is safe to spend.

## Driving it with puppeteer

Preconditions: staging `/api/version` returns 200. Chromium launches at both viewports. Screen spec file: `features/screens/signup.md`.

- Open the form: `node .cursor/skills/verify-timesyncher-vacation/scripts/verify-layout.mjs --out <dir> --only signup-checkout` opens `/` at 390x844 and 1280x800. Observable result: `<dir>/verify/signup-checkout-form-<390|1280>.png` and a VERIFY row whose layout fails when the form is missing, the page is wider than the viewport, or `features/screens/signup.md` is missing.
- Coupon: the same command writes a `coupon` row. Observable result: `verified-unreachable` and a failed row. The form is not submitted.

## Gotchas

- Do not redeem a coupon from this drive. There is no disposable code in the map.
- The judge needs `features/screens/signup.md`. Until Product writes it, the form row fails `spec-missing`.
