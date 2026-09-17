# Restaurant / store tags and chips

Live detail fields in `index-BKun7ofk.js` (do not invent chips). Shown on restaurant-class / store-class things.

## Restaurant tags / chips

Label: **Restaurant tags / chips**. Free-text plus chip toggles. Placeholder: `Italian, Michelin-starred, Romantic / Date Night`.

Live chip array `ot`:

American / New American, Italian, French / Bistro, Mexican, Latin / Cuban, Spanish / Tapas, Mediterranean, Greek, Seafood, Steakhouse, Sushi / Japanese, Chinese, Thai, Korean, Indian, Vegetarian / Vegan, Breakfast, Cafe / Brunch, Airport Lounge / Restaurant, Wine Bar, Cocktail Bar / Happy Hour, Pub / Casual Bar Food, Jazz Club / Dinner + Music, Fine Dining, Michelin-starred, Romantic / Date Night, Pre-theater / Lincoln Center, Family-style / Casual, Late-night.

## Store tags / chips

Label: **Store tags / chips**. Placeholder: `Grocery / Market, Juice / Smoothie, High-end Retail`.

Live chip array `gt`:

Grocery / Market, Pharmacy / Essentials, Convenience / Snacks, Juice / Smoothie, Coffee / Cafe, Bakery / Dessert, Health / Wellness, Organic / Natural Foods, Prepared Foods, Wine / Spirits, High-end Retail, Department Store, Boutique, Jewelry, Watches, Fashion / Apparel, Shoes, Beauty / Skincare, Gifts / Souvenirs, Books / Stationery, Home / Design, Electronics, Kids / Toys, Museum Shop, Luxury Mall / Shopping Center, Local NYC Specialty.

These are product TREK arrays (NYC-oriented copy is existing code). Not Keepsakes Config toggles. Do not invent chips outside `ot` / `gt` (`timesyncher-travel-restaurant-tagger` / `timesyncher-travel-store-tagger`).

## List-tab chips (blast radius)

Restaurants tab chips `ci` and Stores tab chips `$n` harvest **only tags present on real Things in that tab’s current area-filtered list**. Exclude `__tsLiveFill` extras (they have no tags). Do not harvest from the unfiltered full `Oc` / `Fs` catalogs. Selected-tag filters (`Te` / `Je`) do not shrink the chip inventory.

List-tab filters also use **All areas** (`filters.md`).
