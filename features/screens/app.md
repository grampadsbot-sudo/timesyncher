# TSV canonical UI spec (Craig)

Canonical. Craig's words win over any repo file, skill, Feature Map entry or agent summary. The repo mirror is `features/screens/app.md` (TSV Product Eng writes it from this page). Any customer-facing product ruling Craig gives goes into this page in the same turn it is given (rule in `skills/tsv-engineer-pr-process/skill`).

**Read with common sense.** "Nothing else" removes clutter (menus, logos, placeholders, internal copy). It never removes the basic controls any chat app needs, such as a send button. If a literal reading would remove something every customer obviously needs, keep it and note it here.

## Craig, 2026-10-03 9:26 AM PT (verbatim; he says he has given it several times before and it was never captured)
> "It's a Grok-like text interface: just a text box with the file-add and speak buttons. The dropdown of vacations shows up if a customer has more than one vacation. Otherwise nothing in the header. The vacation website shows up on top once it has stuff in it. There is a control slider in the middle once the vacation shows up. Nothing else."

Also (same ruling): delete the trip page's **Open navigation** / **Settings** menu.

## Craig, 2026-10-03 9:42 AM PT (verbatim)
> "The header should be hidden if there are not multiple vacations. Not just empty. I also think we need a full screen control in the web site area."

Meaning: with 0 or 1 vacations the header element is not rendered at all (display none or absent; it takes 0px height, no border, no bar). The website area has a full-screen control that expands the website to fill the viewport and can be exited back to the split view.

## Craig, 2026-10-03 10:50 AM PT (verbatim)
> "The send button is gone??? Omg please use a little common sense, of course we need a send button?"

Meaning: the composer is the text box with file-add, speak and send buttons (as in Grok). Enter also sends; Shift+Enter is a newline; phone keyboards show Send.

## What that means per state (assert exactly this; anything else on screen is a FAIL)
Composer in every state below = the text box with file-add, speak and send buttons.

| State | Header | Top | Middle | Bottom |
|---|---|---|---|---|
| 0 vacations | hidden (0px, not rendered) | conversation only | nothing | text box with file-add, speak and send buttons |
| 1 vacation, no site content yet | hidden (0px, not rendered) | conversation only | nothing | text box with file-add, speak and send buttons |
| 1 vacation with site content | hidden (0px, not rendered) | the vacation website, with a full-screen control | the control slider | text box with file-add, speak and send buttons |
| 2+ vacations | vacation dropdown only | the selected vacation's website once it has content, with a full-screen control | the control slider once the website shows | text box with file-add, speak and send buttons |
| Website full-screen | none | website fills the viewport, with an exit-full-screen control | none | none |

Every state is checked at 390x844 and 1280x800. "Nothing else" means: no logo pill, no Open navigation, no Settings, no extra buttons beyond the composer's send, file-add and speak and the full-screen control, no placeholder or internal copy, no second text box.

## Open points (Product to confirm with Craig via CoS; do not guess)
- Whether the conversation stays visible between the website and the text box when a site exists, and how the slider divides them.
- Whether a brand mark is allowed anywhere ("nothing in the header" reads as no).

## Changelog
- 2026-10-03 10:50 AM PT: send button restored (it had been removed by reading "nothing else" literally); common-sense rule added. The composer is the text box with file-add, speak and send buttons.
- 2026-10-03 9:42 AM PT: header hidden (not just empty) under 2 vacations; full-screen control in the website area.
- 2026-10-03 9:26 AM PT: captured from Craig (relayed by the TSV Eng lead).
