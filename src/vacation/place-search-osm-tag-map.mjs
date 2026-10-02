/** Structural OSM tag → app place category (no name/word intent). */

const OSM_ACTIVITY_TOURISM = /^(?:attraction|museum|gallery|viewpoint)$/;

function shopGrocery(tags) {
  return /^(?:supermarket|grocery|convenience|greengrocer)$/.test(String(tags.shop || '').trim().toLowerCase());
}

function amenityMarketplace(tags) {
  return String(tags.amenity || '').trim().toLowerCase() === 'marketplace';
}

function shopFarm(tags) {
  return String(tags.shop || '').trim().toLowerCase() === 'farm';
}

function amenityFood(tags) {
  return /^(?:restaurant|cafe|fast_food)$/.test(String(tags.amenity || '').trim().toLowerCase());
}

function shopRetail(tags) {
  const shop = String(tags.shop || '').trim().toLowerCase();
  if (!shop || shopGrocery(tags) || shopFarm(tags)) return false;
  return true;
}

function leisureGarden(tags) {
  const leisure = String(tags.leisure || '').trim().toLowerCase();
  const tourism = String(tags.tourism || '').trim().toLowerCase();
  return leisure === 'garden' || tourism === 'garden';
}

function tourismActivity(tags) {
  const tourism = String(tags.tourism || '').trim().toLowerCase();
  return tourism && OSM_ACTIVITY_TOURISM.test(tourism);
}

const AMENITY_DISPLAY = {
  restaurant: 'Restaurant',
  cafe: 'Cafe',
  fast_food: 'Fast food',
  marketplace: 'Marketplace',
};

const SHOP_DISPLAY = {
  farm: 'Farm stand',
  supermarket: 'Supermarket',
  grocery: 'Grocery',
  convenience: 'Convenience store',
  greengrocer: 'Greengrocer',
};

function displayFromTags(tags) {
  const amenity = String(tags.amenity || '').trim().toLowerCase();
  if (amenity && AMENITY_DISPLAY[amenity]) return AMENITY_DISPLAY[amenity];
  const shop = String(tags.shop || '').trim().toLowerCase();
  if (shop && SHOP_DISPLAY[shop]) return SHOP_DISPLAY[shop];
  const tourism = String(tags.tourism || '').trim().toLowerCase();
  if (tourism && OSM_ACTIVITY_TOURISM.test(tourism)) {
    return tourism.charAt(0).toUpperCase() + tourism.slice(1);
  }
  if (String(tags.leisure || '').trim().toLowerCase() === 'garden') return 'Garden';
  return '';
}

/**
 * @type {ReadonlyArray<{ appCategory: string, filter: string, match: (tags: object) => boolean, displayName: (tags: object) => string }>}
 */
export const OSM_TAG_TO_APP_CATEGORY = Object.freeze([
  {
    appCategory: 'grocery',
    filter: '["shop"~"supermarket|grocery|convenience|greengrocer"]',
    match: shopGrocery,
    displayName: displayFromTags,
  },
  {
    appCategory: 'market',
    filter: '["amenity"="marketplace"]',
    match: amenityMarketplace,
    displayName: displayFromTags,
  },
  {
    appCategory: 'market',
    filter: '["shop"="farm"]',
    match: shopFarm,
    displayName: displayFromTags,
  },
  {
    appCategory: 'restaurant',
    filter: '["amenity"~"restaurant|cafe|fast_food"]',
    match: amenityFood,
    displayName: displayFromTags,
  },
  {
    appCategory: 'store',
    filter: '["shop"]',
    match: shopRetail,
    displayName: (tags) => displayFromTags(tags) || 'Store',
  },
  {
    appCategory: 'garden',
    filter: '["leisure"="garden"]',
    match: leisureGarden,
    displayName: () => 'Garden',
  },
  {
    appCategory: 'activity',
    filter: '["tourism"~"attraction|museum|gallery|viewpoint"]',
    match: tourismActivity,
    displayName: displayFromTags,
  },
]);

function osmTagRuleForTags(tags = {}) {
  return OSM_TAG_TO_APP_CATEGORY.find((entry) => entry.match(tags)) || null;
}

export function osmAppCategoryFromTags(tags = {}) {
  const rule = osmTagRuleForTags(tags);
  return rule ? rule.appCategory : '';
}

export function osmProviderCategoryNameFromTags(tags = {}) {
  const rule = osmTagRuleForTags(tags);
  if (!rule) return '';
  return String(rule.displayName(tags) || '').trim();
}
