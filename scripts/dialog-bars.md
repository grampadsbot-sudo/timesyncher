# Dialog bars

`scripts/dialog-bars.mjs` reads `scripts/dialog-bar-terms.json`. `scripts/check-hardcoded-content.mjs` scans source. `scripts/check-dialog-pack.mjs` scans chat packs. Pack turns are chat, so path exemptions and the exact-string allow do not apply there.

## Exact strings

`exactAllow.strings` is a list of source texts. Comparison is literal equality of the characters inside the quotes. It is not a regex. The allow applies only in:

- `scripts/vacation-app-reply-rules.mjs`
- `src/vacation/live-app-turn.mjs`

The same text in any other file stays in scope. A paraphrase in either file stays in scope.

## Purchase flow

`BAR-RESERVATION-PAYMENT` is exempt on the TimeSyncher purchase-flow paths listed in `dialog-bar-terms.json`. Chat, replies, and prompts stay in scope. `reservationWordFiles` lets only the bare word reservation through in the #1076 account-handshake sources. make-a-reservation, book-for-you, deposit, payment, checkout, pay, and charge still fail in those files, and the bare word still fails everywhere else, including dialog-pack turns.

`BAR-SPLIT-PAYER` and `BAR-UNLIMITED-WORDING` are exempt only on the checkout modules:

- `routes/checkout-config.mjs`
- `routes/create-payment-intent.mjs`
- `routes/checkout-coupon.mjs`

Other files, including chat, reply, and prompt files, stay in scope for those rules.

`BAR-UNLIMITED-WORDING` matches `unlimited` followed by at most six words and then `vacation` or `vacations`, in any case. The canonical plan line is included. Adjacent string `+` joins, quoted template interpolations, array `.join` results, and `.split().join()` results are folded and checked the same way. The three checkout modules stay exempt. A baseline row cannot hide a hit: customer-facing matches fail.
