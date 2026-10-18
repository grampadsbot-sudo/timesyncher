# Vacation Day View

Live labels:

- **Vacation Day View**
- Day chips: **Day 1** / **Day 2** / **Day 3** (trip-day count)
- Map copy: “Only things tagged for this day + Timeline appear on the map below.”
- Timeline rows open **Open thing details**. Hovering a Thing photo thumb opens a speech-bubble popup; the pointer tip toward the timeline icon must stay fully visible (day card `overflow: visible`, caret `box-sizing: content-box`). Travel-to / travel-from rows do not reprint the Thing summary.

Empty: “No timeline-tagged things yet for this day.”

## React preview content — #336 piece A

The preview retains its existing title/icon structure. Titled day headings keep the day number (for example **Day 1 · Arrival**) without repeating it when already present. Flight titles use the stored airline/route text and omit the **Flight option:** prefix. Flight and travel rows do not repeat a Thing summary; ordinary Thing summaries carry `data-summary-src="thing"` hooks.

Flights with a parsed departure/arrival clock range include the staging-approved 90-minute **Travel to airport** and **Travel from airport** legs on that flight's assigned day. For the Southwest LAS–LGA 05:05–15:45 case, the legs are 3:35–5:05 am and 3:45–5:15 pm. A flight without both times gets no synthesized transfer. Explicit flight-day membership remains required.

Photo/video dialogs opened by the preview thumbnail are rendered at the document body and positioned from the thumbnail's measured viewport rectangle. They stay within the viewport on resize and scroll, including the popup pointer, while the timeline scrolls above the visible map. The existing served hover-popup behavior described above is unchanged. `test/{dayTimeline,presentation}.unit.mjs` cover content, visible transfer times and transfer/check-in conflicts. This is preview-source behavior, pending host publication and visual acceptance.
