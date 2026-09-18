# Detail page

Live inspector title: **Detail page**. Name field: `aria-label="Detail name"`. Close: **×**.

Shared fields (live TREK `index-BKun7ofk.js`, 2026-09-10 — do not invent extras):

- **Days**
- **Timeline** (checkbox; hidden for cars)
- **Status**
- **Type**
- **Area**
- **Start** (placeholder TBD)
- **Duration** (placeholder TBD)
- **Multi-day schedule: edit each day’s time** (enabled when multiple days + Timeline; else “(select multiple days + Timeline)”). Per-day **Start** / **Duration**. Helper: “Blank selected-day fields fall back to the standard Start and Duration above. Unselected days stay disabled.”
- **Price** (placeholder `$ / estimate`; `overrides.price ?? thing.price` via `bi()`)
- **Estimated travel time** (placeholder TBD; override `travelTime`). Helper: “Estimate how long it takes to get here. If blank, TimeSyncher saves its best guess from the timeline order.”
- **Summary** (textarea; placeholder “Short paragraph on why this is a good option”)
- **Story** (textarea; `overrides.story`). Placeholder: “What happened here? What you ordered, funny moments, favorite memories, who loved it, or any personal trip note for the final recap.”
- **Include in final recap / places to visit next time** (checkbox; writes `includeInTripRecap` and `nextTime`)
- **Website** + **Open ↗** when a URL is set
- **Details** (textarea `longDetails`; placeholder varies by flight / car / other)

Timeline rows use **Open thing details**. Edit-state copy: see `collaborators.md`.

Type-specific fields: `happy-hour.md`, `hotel-stay-fields.md`, `flight-fields.md`, `car-fields.md`, `ratings-reviews.md`, `tags-chips.md`.
