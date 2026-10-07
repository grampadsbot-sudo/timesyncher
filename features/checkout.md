# Checkout

Checkout lets a customer buy a TimeSyncher Vacation plan and optional photo/video memories, then proves the resulting entitlements on a synthetic account without charging production Stripe.

## Sub-features

- `checkout-single` prices the $37 single-vacation plan.
- `checkout-unlimited` adds the $27 unlimited-vacations bump.
- `checkout-photo-memories` adds photo keepsake access for the selected scope.
- `checkout-video-memories` adds video upload access from add-on or owner-media checkout.
- `checkout-coupon` redeems a hashed coupon without exposing the raw code in receipts.
- `checkout-entitlement-proof` reads unlimited trips, photos, and videos from a synthetic account.

## How to get to it (user POV)

- Open `https://www.timesyncher.com` and complete the vacation checkout form.
- Open `/addons-checkout.html` after purchase to add Telegram collaborator and media access.
- Open `/owner-media-checkout.html` to add owner photo/video upload access.
- Ask Telegram "Do I have unlimited vacations?" or "Am I able to upload pics and videos?"
- Run the synthetic entitlement fixtures through `control-vacation`.

## Driving it with control-vacation

Preconditions:

- `node scripts/control-vacation.mjs doctor` exits `0`.
- Production Stripe keys are not used. The synthetic accounts live in `features/fixtures/checkout-entitlements.json` and `features/fixtures/checkout-entitlements-missing.json`.

- **Paid synthetic account.** Prove unlimited trips, photos, and videos. Run `node scripts/control-vacation.mjs dry-run --fixture features/fixtures/checkout-entitlements.json --json`. Exit code `0`. `customer_facing_response` names unlimited trips, photo upload, and video upload. `planned_writes` is empty.
- **Unpaid synthetic account.** Fail closed. Run `node scripts/control-vacation.mjs dry-run --fixture features/fixtures/checkout-entitlements-missing.json --json`. Exit code `0`. `no_ops[0].reason` is `checkout_entitlement` and no write is planned.
- **Pricing unit check.** Run `node scripts/smoke_checkout_coupons.mjs`. Exit code `0`. Single plan is `3700` cents; unlimited plus photos is `6900` cents in the default env.
- **Proof.** Keep `artifacts/vacation-verify/vac-verify-checkout-entitlements/dry-run.json` and `events.jsonl`. Do not call `/api/create-payment-intent` against live Stripe.

## Gotchas

- `index.html` checkout is the customer storefront; `/order-test.html` is not a production proof.
- Photo Memories on the landing page is a keepsake add-on. Owner Telegram uploads also require the media entitlement flags in `entitlements.metadata`.
- A Telegram answer that only restates pricing is not entitlement proof. The fixture account must carry the flags.
- Do not set `allowProductionBilling` on a verification input.
