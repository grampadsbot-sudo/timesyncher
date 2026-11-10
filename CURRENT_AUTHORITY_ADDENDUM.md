# CURRENT AUTHORITY ADDENDUM — eggbot 7:27 AM PT 11/10
Craig 7:26 AM PT added a third item to this issue/PR. Include it in this same round if you have not finished. If you already finished source-ready without it, stop after your receipt and leave the extra work for a same-PR host follow-up — do not open a second PR.

## 3) Pin the hero collapse chevron to the upper-left corner (Craig 7:26 AM PT)
#944 already shipped and is live; put this in the SAME PR as the pencil + price work, not a #944 follow-up.

The chevron (`[data-ts-trip-hero-collapse]` in `public/ts-trip-hero-collapse.js`) currently sits beside the title in a two-column grid (`grid-template-areas:"toggle title"`, `position:relative; left:auto; top:auto`). That is the bug. Pin it to the black hero section's upper-left corner in BOTH the expanded and collapsed states: `position:absolute` with a small inset (~8–12px top and left). The hero is already `position:relative`.

- The title (`h1`) must stay centered and must wrap with no clipping in both states. Today's collapsed rule (`white-space:nowrap; overflow:hidden; text-overflow:ellipsis`) clips — that has to go. The collapsed bar must still stay slim (keep tight vertical padding; do not let a clipped one-line title be the way it stays slim).
- Nothing may overlap (chevron vs title, title vs detail/actions when expanded). Give the header enough reserved padding or safe inset so the absolutely positioned control does not cover glyphs.
- `scripts/test_vacation_app_927_hero_collapse.mjs` currently asserts the chevron is NOT `position:absolute;left:10px;top:8px`. Update that test to require the upper-left absolute pin, centered wrapping title, no overlap, and a slim collapsed bar. Keep a 390 WebKit / touch-tap proof: expanded and collapsed.

Do not write NYC / trip 99 itinerary data. Proofs may use a copy trip or a local 390 fixture; do not save edits on NYC.
