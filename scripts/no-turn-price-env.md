# NO-TURN-PRICE-ENV

Chat and reply turn modules must not read price or checkout config. Reply Eng owns removal. New hits fail. Hits already on this tree are report-only rows in `scripts/hardcoded-content-baseline.json` with rule id `NO-TURN-PRICE-ENV`.

## Scanned files

`rg` on this tree:

- `src/vacation/live-app-turn.mjs`
- `routes/vacation-telegram-turn.mjs`
- `scripts/vacation-app-reply-rules.mjs`

`src/vacation/turn-tags.mjs` is not an `*-turn.mjs` module. `scripts/vacation-app-reply-rules-snapshot.json` is not a module.

## Scope

The checker also scans any later file that matches these patterns:

- `src/vacation/live-app-turn.mjs`
- `*-turn.mjs` under `src/` and `routes/`
- `vacation-*-turn` modules
- `scripts/vacation-app-reply-rules.mjs`
- `src/**/reply-rules*` modules
- `*reply*rules*` modules (`.mjs`, `.js`, `.cjs`)

## Failures

In a scanned module:

- `process.env` dot, bracket, or destructure of a name ending in `_PRICE_CENTS` or starting with `TIMESYNCHER_ORDER_`
- a whole `process.env` passed into a call, including `priceAnswered(x, process.env)`, or stored on an object field
- `import` or `require` of `checkout-config*`, `create-payment-intent*`, or `checkout-coupon*`, including a function those modules export whose body or module top level reads a price or order env name

`env = process.env` as a default parameter is not a call.

## Allowed

`checkout-config`, `create-payment-intent`, and `checkout-coupon` modules (including `checkout-coupons`) and their tests. A unit test is also exempt when its only hits are assignments such as `process.env.TIMESYNCHER_BASE_PRICE_CENTS = '3700'`.
