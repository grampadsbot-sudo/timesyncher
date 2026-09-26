# Jev quality, post-intake welcome, and Thing pages

SoT: `bot-admin/messages/time-syncher/dialog-jev-quality-rewrite-and-post-intake-20260926`.

Hold certify. This inventory is not a certify.

## Customer path

1. **Onboarding.** After Agree, `vacation-app.html` shows the onboarding chat (`data-screen="onboarding"`). The path nav is Onboarding, then Itinerary.
2. **Every generated reply.** `produceLiveAppReply` still classifies with Jev, then the bake-off tier writes a draft. `jevQualityRewrite` asks Jev on `/api/alpha/decisions` (`typesafe/jev-1.13`) for a score 1–5, a comment that quotes this turn, and keep-or-rewrite. A score of 3 or below, or a broken rule, does not ship the draft. The same bake-off tier rewrites the whole reply (not the draft plus a paragraph), Jev scores that rewrite, and a second rewrite is allowed when it still fails. The stored turn keeps `quality.judged`, `quality.score`, `quality.comment`, `quality.rewritten`, and `quality.rewriteModel` from the bake-off tier or Jev. A reply Jev does not score is not stored. The Dialog PDF line is `quality: <score> — <comment>` and adds `(rewritten by <model>)` when the rewrite was accepted. `quality: not judged` is refused. Item34 also bans "splitting anything up" and other split or splitting payment phrasing. A place, activity, or venue the customer did not name docks the score and forces that rewrite. Two options stay in the customer's own words. A later price question names `unlimited vacations for the whole year` and does not add a second welcome.
3. **Long intake.** The first customer dump of about seventy words that names the trip (place plus gardens, swim, groceries, dinner, family, or dates) is the post-intake turn. That reply says the itinerary is being built from the dump, explains collaborator options, and gives the one full welcome with `unlimited vacations for the whole year`. A later price question does not add a second welcome.
4. **Itinerary and Thing pages.** That same dump stores Things from the customer's words: Big Island, Gardens, Groceries, Dinner, Swim, and the Kailua-Kona house when those words are in the dump. The trip badge leaves `no vacations yet` and shows the place and dates the customer named, such as Big Island Apr 3–12 2026. Itinerary (`data-screen="itinerary"`) lists each Thing with that day placement: the trip span, groceries on the arrival day with the airport shuttle, a later-week swim, and the no-two-big-activities rule. Each Thing page (`data-screen="thing"`) shows who, when, the intake notes, and a collaborator note surface. Swim when-line keeps the intake "later in the week", then the customer's Monday beach or house pool, and a Thursday swim only when the transcript keeps that second swim. Later customer lines that name a day are notes. They do not invent a place. A garden Thing is titled Gardens. The producer does not invent Kahaluu, Pua Mau, an arboretum, a snorkel cruise, Volcanoes, Puʻuhonua o Hōnaunau, Captain Cook, or a weather excuse that moves the garden.
5. **Rewrite proof.** When Jev's rewrite is the customer-facing reply, the stored turn keeps `quality.rewritten` true and `quality.draft` as the text the customer did not see. The transcript body is the rewrite. An unchanged rewrite stays `rewritten: false`.

## How to get to it (user POV)

- Open the app URL and agree to the terms. That is Onboarding.
- Send the long trip dump. Read the reply that says the itinerary is being built and names the household plan.
- Choose Itinerary, then open each Thing.
