# Detail page

Live inspector title: **Detail page**. Name field: `aria-label="Detail name"`. Close: **×**.

Thing view/edit #969 follows GBrain `bot-admin/decisions/vk-edit-mode-20261112` and `bot-admin/decisions/vk-mockup-feedback-20261112` (Craig 11:33–11:36 AM PT). Implementation: `src/vacation/trek-thing-detail-v3-patch.mjs`, applied by the existing TREK renderer in `src/vacation/trek-style2-bundle.mjs`; served asset `public/assets/index-BKun7ofk.js`.

Body order in both modes: **TIMELINE, STORY, Happy Hour, Summary, Reviews, Photos & videos, remaining fields**. View hides empty fields and unchecked flags. Edit offers the same fields on sparse and populated Things; Reviews remain read-only and hide when empty.

Shared fields:

- **Days**
- **Timeline visits**: unnumbered one-line `Day N · Start: 6:30 PM · 90 min · Status: Reservation`. Times omit seconds. Each visit has its own Day, Start, Duration and Status, with **+ Add visit** and remove controls. Repeated visits on the same day are supported. Storage extends the existing `perDaySchedule[dayId]` with `visits` and mirrors its first visit into the existing schedule fields. Selecting a day adds a visit; deselecting it removes that day's visits. No Thing-level Status control.
- **Type**
- **Area**
- **Price** (placeholder `$ / estimate`; `overrides.price ?? thing.price` via `bi()`)
- **Estimated travel time** (placeholder TBD; override `travelTime`). Helper: “Estimate how long it takes to get here. If blank, TimeSyncher saves its best guess from the timeline order.”
- **Summary** (textarea; placeholder “Short paragraph on why this is a good option”)
- **Story** (textarea; `overrides.story`). Placeholder: “What happened here? What you ordered, funny moments, favorite memories, who loved it, or any personal trip note for the final recap.”
- **Include this story in the final keepsake** beneath Story (checkbox; writes only `includeInTripRecap`)
- **Add to Next Time list** (separate checkbox; writes only `nextTime`)
- **Happy Hour** (one free-text field, `happyHourDetails`, for every Thing)
- **Reviews** (own section after Summary, gold `#F59E0B` stars above each stored blurb; no source labels, numeric source ratings or editors)
- **Photos & videos** (bound photos and playable videos, with existing caption persistence)
- **Address**, **Hours**, **Phone**, **Website**, **Area**, **Itinerary note**, **Details**, **Latitude**, **Longitude**; blank fields remain available in edit
- **Website** + **Open ↗** when a URL is set
- **Details** (textarea `longDetails`; placeholder varies by flight / car / other)

Timeline rows use **Open thing details**. Edit-state copy: see `collaborators.md`.

View mode (#959): the header shows the stars and **Price: $N** on one rating row (`data-ts-detail-rating-row`, `data-ts-detail-field="price"`). The price is `overrides.price ?? thing.price`, rounded and formatted like Budget. The label is always **Price:**, never per person. The pencil (`data-ts-detail-edit`, **Edit thing**) shows only when edit access is granted. See `collaborators.md`.

#969 keeps Overall Rating left and Price right, with gold stars in the header and reviews. In edit, the pencil becomes a checkmark (**Save changes**, `data-ts-detail-save`) beside ×; the existing field autosave path persists edits. Verification extends `scripts/test_issue_959_owner_pencil_webkit.mjs` at 390 and 430 in iPhone WebKit touch, using only an in-memory snapshot copy. It checks independent flags, repeated visits, reload persistence, hidden empty sections, and sparse Story/Happy Hour/Hours fill and clear. Optional `ACCEPTANCE_DIR` writes `969.json`. This inventory is not a CI or publication verdict.

Type-specific fields: `happy-hour.md`, `hotel-stay-fields.md`, `flight-fields.md`, `car-fields.md`, `ratings-reviews.md`, `tags-chips.md`.
