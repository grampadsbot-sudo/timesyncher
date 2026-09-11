# Budget

GBrain: `bot-admin/messages/time-syncher/keepsake-qa-budget-rules-20260910`  
QA skill: `skills/keepsake-qa/skill`  
Autonomy: `autonomous-app-customer-flow-20260910` — budget inclusion stays in product TREK code, not a babysit rewrite.

Do **not** invent inclusion rules. This is the live TREK shared renderer in `index-BKun7ofk.js` (`q==="budget"`).

## When the tab appears

Shared tabs include **Budget** (💵) only when the share payload has `share_budget`. Live vacation-3 shows the tab.

Labels: **Overall trip budget**, **Trip total**. Currency prefix `$` when `trip.currency` is USD, else the currency code.

## Which things appear (existing code)

Rows `Mo` are built as:

1. For each trip day `Qa`, take timeline rows `Ci(day)`.
2. Keep rows that have an `item`.
3. **Drop** timeline types: `travel`, `travel-to-thing`, `transport`, `hotel-wake`, `hotel-sleep`, `hotel-checkout`.
4. Dedupe by thing id.

A thing with no matching timeline row (after those type filters) does **not** appear on Budget.

## Bucket (existing `It(item)` category)

| Category | Budget bucket (UI label) |
| --- | --- |
| `restaurant` | Restaurants |
| `store` | Stores |
| `flight` | Flights |
| `hotel` | Hotel |
| anything else | Other Things (shown as **The Rest**) |

A bucket block is omitted when planned total is 0, target is 0, and the bucket has no rows.

Staging classifies `thingOverrides.category` / place category with restaurant **before** `car`, so Carbone / Lotus / Eggslut / Shake Shack land in **Restaurants** and Cosmopolitan shops in **Stores**. They must not dump into The Rest / Other Things only. Header **Config Options** is Trip View (Flights / Hotels / Cars), not Keepsakes Admin/Config — see `config-options-trip-view.md`.

## Amount (existing price parse)

Price text is `overrides.price ?? thing.price` (`bi()`).

- Parse `$` / plain numbers; if two or more numbers, use the average of the first two.
- If category is hotel **or** the price text contains `night`, multiply by stay days.
- If the price text matches `per person|pp|fare|ticket|flight` **or** category is one of `restaurant`, `store`, `event`, `family_event`, `tour`, `transport`, `music`, `workout`, `artist`, `theatre`, `sightseeing`, `other`, `flight`, multiply by 2.
- Round to a whole number.
- No parsed digits → amount 0 and the row shows **Add price** (`hasPrice` is `/\$?\d/` on the raw price string).

## Targets

Per-bucket target: `thingOverrides.__budgetTargets` key `overall:{bucket}` if set; else a sum of trip `expenses` whose `category` string matches that bucket. The live `Stores` branch makes expense-derived store targets empty (existing condition). Editors with access can type a target (`aria-label` `{bucket} target`).

Trip total planned = sum of included thing amounts. Trip total target = sum of bucket targets.

Under/Over chip compares planned vs target.

## Not in Keepsakes Config

Budget is a live shared-tab feature, not a Keepsakes → Admin/Config toggle.
