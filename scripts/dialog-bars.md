# Dialog bars

`scripts/dialog-bars.mjs` reads `scripts/dialog-bar-terms.json`. `scripts/check-hardcoded-content.mjs` scans source. `scripts/check-dialog-pack.mjs` scans chat packs. Pack turns are chat, so path exemptions and the exact-string allow do not apply there.

## Exact strings

`exactAllow.strings` is a list of source texts. Comparison is literal equality of the characters inside the quotes. It is not a regex. The allow applies only in:

- `scripts/vacation-app-reply-rules.mjs`
- `src/vacation/live-app-turn.mjs`

The same text in any other file stays in scope. A paraphrase in either file stays in scope.

## Purchase flow

`BAR-RESERVATION-PAYMENT` is exempt on the TimeSyncher purchase-flow paths listed in `dialog-bar-terms.json`. Chat, replies, and prompts stay in scope.

`BAR-SPLIT-PAYER` and `BAR-UNLIMITED-WORDING` are exempt only on the checkout modules:

- `routes/checkout-config.mjs`
- `routes/create-payment-intent.mjs`
- `routes/checkout-coupon.mjs`

Other files, including chat, reply, and prompt files, stay in scope for those rules.
