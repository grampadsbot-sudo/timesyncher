# Jev quality, post-intake welcome, and Thing pages

SoT: `bot-admin/messages/time-syncher/dialog-jev-quality-rewrite-and-post-intake-20260926`.

Hold certify. This inventory is not a certify.

## Customer path

1. **Onboarding.** After Agree, `vacation-app.html` shows the onboarding chat (`data-screen="onboarding"`). The path nav is Onboarding, then Itinerary.
2. **Every generated reply.** `produceLiveAppReply` still classifies with Jev, then the bake-off tier writes a draft. `jevQualityRewrite` then asks Jev (`typesafe/jev-1.13`) for a score 1–5, a comment, and an optional rewrite. When Jev sends a rewrite that still obeys the destination lock, the Item34 ban, and the garden wording, that rewrite is the customer-facing reply. The stored turn keeps `quality.judged`, `quality.score`, `quality.comment`, and `quality.rewritten`. A reply Jev does not score is not stored. The Dialog PDF line is `quality: <score> — <comment>` and adds `(rewritten)` when Jev's text was accepted. `quality: not judged` is refused.
3. **Long intake.** The first customer dump of about seventy words that names the trip (place plus gardens, swim, groceries, dinner, family, or dates) is the post-intake turn. That reply says the itinerary is being built from the dump, explains collaborator options, and gives the one full welcome with `unlimited vacations for the whole year`. A later price question does not add a second welcome.
4. **Itinerary and Thing pages.** That same dump stores Things from the customer's words: Big Island, Gardens, Groceries, Dinner, Swim, and the Kailua-Kona house when those words are in the dump. Itinerary (`data-screen="itinerary"`) lists them. Each title opens that Thing page (`data-screen="thing"`) with the category and the customer's sentence. A garden Thing is titled Gardens. The producer does not invent Kahaluu, Pua Mau, an arboretum, or a weather excuse that moves the garden.

## How to get to it (user POV)

- Open the app URL and agree to the terms. That is Onboarding.
- Send the long trip dump. Read the reply that says the itinerary is being built and names the household plan.
- Choose Itinerary, then open each Thing.
