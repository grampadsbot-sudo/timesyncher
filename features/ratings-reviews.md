# Ratings and reviews

Detail fields (live):

- **Google rating** (`googleRating`, placeholder 4.6)
- **Yelp rating** (placeholder 4.4)
- **Other rating** (`thirdPartyRating`, placeholder Tripadvisor/OpenTable/Booking)
- **5-star review quote 1** / **2** / **3** (`review1`–`review3`)

Overall stars on the list row (`data-ts-list-row-rating`) and detail header (`data-ts-detail-header-stars`) come from `placeRatingEvidence` (`src/vacation/place-rating-evidence.mjs`), in this order:

- a 1–5 rating cited in the Summary ("Restaurantji shows 4.3", "rate it 4.7 from 1,186 ratings")
- the rating from the source the Summary names, if one is stored
- a stored rating field or a 5-point Other site
- a cited `evidenceDossier.rating`
- a stored Restaurantji or OpenTable page line that names the Thing

A flagged `missingFields: ratings` does not hide a valid stored score. Never show stars for:

- the head of a review count ("shows 2,638 reviews")
- search-snapshot or "not a live fetch" evidence
- 10-point scores
- the individual review stars

Review quotes are never averaged into an overall rating. Rows carry `data-ts-thing-key` and the detail title carries `data-ts-detail-thing-key`.

Print Style two renders review stars as `★★★★★` plus quote text.

Blank rating/review fields on vacation-3 are empty product values (placeholders only). That is not a missing control. Do not invent scores or quotes.

There is no separate media/QR Config toggle for reviews.
