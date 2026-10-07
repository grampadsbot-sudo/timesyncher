# Happy hour

On restaurant/bar-class things (`zi(Dt)` in TREK). Hidden when `It()` is not restaurant/bar.

Product `Mn()` used to classify the string `restaurant` as `car` (`"restaurant".includes("car")`). That hid Carbone from the Restaurants tab and hid happy hour. Staging patches `Mn()` to test restaurant before car. After that, the happy-hour checkbox is the product control; a blank details box is an empty field, not a missing Feature Map item.

Placeholder copy (do not invent values):

- checkbox **Happy hour**
- textarea **Happy hour details** (placeholder: “Recent/current happy-hour offer, menu items, discount, days/times, caveats, and source note”)

Print Style two can emit **Happy Hour Details** when set.
