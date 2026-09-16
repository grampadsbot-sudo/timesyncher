import { DEFAULT_FIRST_PASS_MINIMUMS } from '../../scripts/vacation-public-research-worker.mjs';

/** Print end-lists only. Do not invent other mins. */
export const KEEPSAKE_LIST_MINIMUMS = {
  Restaurants: DEFAULT_FIRST_PASS_MINIMUMS.restaurant,
  Stores: DEFAULT_FIRST_PASS_MINIMUMS.store,
  'Shows, Tours and the Rest': DEFAULT_FIRST_PASS_MINIMUMS.rest,
};

/** First-pass Vegas catalog used only to pad Style-two end lists. */
export const KEEPSAKE_LIST_FILL = {
  Restaurants: [
    'Mon Ami Gabi',
    'Bardot Brasserie',
    'CATCH Las Vegas',
    "Javier's at Aria",
    'Estiatorio Milos',
    'Best Friend by Roy Choi',
    'Holsteins',
    "L'Atelier de Joël Robuchon",
    'Giada',
    'Yellowtail Japanese Restaurant',
    'Mott 32',
    'Jean Georges Steakhouse',
    'Lago by Julian Serrano',
    'Sichuan House',
  ],
  Stores: [
    'Crystals at Aria',
    'Grand Canal Shoppes',
    'Forum Shops at Caesars',
    'Fashion Show Mall',
    'Bellagio Shops',
    'Wynn Esplanade',
    'Harmon Corner',
    'Shoppes at Mandalay Place',
    'Venetian Shoppes',
    'Miracle Mile Shops',
  ],
  'Shows, Tours and the Rest': [
    'Bellagio Fountains',
    'High Roller',
    'The Sphere',
    'Fremont Street Experience',
    'Neon Museum',
    'Atomic Museum',
    'Hoover Dam',
    'Red Rock Canyon',
    'STRAT SkyPod',
    'Welcome to Fabulous Las Vegas Sign',
    'LINQ Promenade',
    'O by Cirque du Soleil',
    'Absinthe',
    'Lake of Dreams',
    'High Tea Conservatory Walk',
  ],
};

function text(value) {
  return String(value || '').trim().toLowerCase();
}

export function namesAlreadyListed(rows = []) {
  return rows.map((row) => text(row?.name || row?.title || row)).filter(Boolean);
}

export function padKeepsakeListNames(bucket, existingRows = []) {
  const min = KEEPSAKE_LIST_MINIMUMS[bucket] || 0;
  const have = namesAlreadyListed(existingRows);
  const extras = (KEEPSAKE_LIST_FILL[bucket] || []).filter((name) => {
    const needle = text(name);
    return !have.some((row) => row.includes(needle) || needle.includes(row));
  });
  return extras.slice(0, Math.max(0, min - existingRows.length));
}

/** Live shared tabs only. Do not feed these rows into Style-two Ae() `G` / p1. */
export const LIVE_TAB_MINIMUMS = {
  restaurant: DEFAULT_FIRST_PASS_MINIMUMS.restaurant,
  store: DEFAULT_FIRST_PASS_MINIMUMS.store,
  rest: DEFAULT_FIRST_PASS_MINIMUMS.rest,
};

export const LIVE_TAB_FILL = {
  restaurant: KEEPSAKE_LIST_FILL.Restaurants,
  store: KEEPSAKE_LIST_FILL.Stores,
  rest: KEEPSAKE_LIST_FILL['Shows, Tours and the Rest'],
};

export function padLiveTabRows(kind, existingRows = []) {
  const names = padKeepsakeListNames(
    kind === 'restaurant' ? 'Restaurants' : kind === 'store' ? 'Stores' : 'Shows, Tours and the Rest',
    existingRows,
  );
  const baseId = kind === 'restaurant' ? 910000 : kind === 'store' ? 920000 : 930000;
  return names.map((name, index) => ({
    id: baseId + index + 1,
    name,
    __tsLiveFill: 1,
    category: kind === 'rest' ? 'event' : kind,
    lat: 36.1147,
    lng: -115.1729,
    address: 'Las Vegas',
  }));
}

/** Thing-stored catalog used when GET-padding Style-two / Style-one end lists. Not PDF-time invent. */
export const KEEPSAKE_FILL_DETAILS = {
  'Mon Ami Gabi': { lat: 36.1125, lng: -115.1726, summary: 'Paris Las Vegas sidewalk steak-frites on the Strip — a first-pass Vegas dinner that still feels like a terrace.' },
  'Bardot Brasserie': { lat: 36.1074, lng: -115.1766, summary: 'Aria French brasserie with a published happy hour — the nearby ARIA sit-down when Carbone is the special night.' },
  'CATCH Las Vegas': { lat: 36.1109, lng: -115.1752, summary: 'Aria seafood room with a late-night Strip energy; first-pass Vegas list, not a substitute for Carbone.' },
  "Javier's at Aria": { lat: 36.1075, lng: -115.1768, summary: 'Aria Mexican dining room — guacamole, tableside theatrics, and a walkable stop on the same floor as Carbone.' },
  'Estiatorio Milos': { lat: 36.1097, lng: -115.1739, summary: 'Cosmopolitan Greek seafood — iced fish display and a serious lunch when the Strip walk needs a table.' },
  'Best Friend by Roy Choi': { lat: 36.1026, lng: -115.1746, summary: 'Park MGM Korean-American counter from Roy Choi — K-town flavors without leaving the Strip corridor.' },
  'Holsteins': { lat: 36.1098, lng: -115.1738, summary: 'Cosmopolitan burger hall with shakes and a late kitchen — easy, loud, and on the same Cosmo walk as Eggslut.' },
  "L'Atelier de Joël Robuchon": { lat: 36.1023, lng: -115.1764, summary: 'MGM Grand counter tasting from Robuchon — a first-pass special-night list entry, not an itinerary assignment.' },
  'Giada': { lat: 36.1215, lng: -115.1694, summary: 'The Cromwell Strip-view Italian from Giada — pasta and a window on the Bellagio fountains.' },
  'Yellowtail Japanese Restaurant': { lat: 36.1127, lng: -115.1766, summary: 'Bellagio Japanese with a lounge — sushi and a walk back through the Conservatory.' },
  'Mott 32': { lat: 36.1214, lng: -115.1696, summary: 'Venetian Hong Kong-style Chinese — Peking duck as a first-pass Vegas dining name, stored not invented at print.' },
  'Jean Georges Steakhouse': { lat: 36.1076, lng: -115.1764, summary: 'Aria steakhouse from Jean-Georges — a first-pass Strip steak name on the same property as Carbone.' },
  'Lago by Julian Serrano': { lat: 36.1125, lng: -115.1768, summary: 'Bellagio Italian facing the fountains — a first-pass anniversary-adjacent table, not the Conservatory story.' },
  'Sichuan House': { lat: 36.1264, lng: -115.1789, summary: 'Off-Strip Sichuan heat — a first-pass counterweight to the Strip Italian-American reservation.' },
  'Crystals at Aria': { lat: 36.1078, lng: -115.1762, summary: 'CityCenter luxury mall between Aria and the Strip walk — first-pass shopping fill for the Stores list.' },
  'Grand Canal Shoppes': { lat: 36.1212, lng: -115.1697, summary: 'Venetian indoor canal shops — a first-pass Vegas retail stretch, stored on the Thing for print.' },
  'Forum Shops at Caesars': { lat: 36.1178, lng: -115.1756, summary: 'Caesars Palace high-end mall — first-pass Strip shopping, not Cosmopolitan shops.' },
  'Fashion Show Mall': { lat: 36.1296, lng: -115.1729, summary: 'North Strip mall across from Wynn — first-pass Stores catalog so the end list is not itinerary-only.' },
  'Bellagio Shops': { lat: 36.1128, lng: -115.1765, summary: 'In-hotel Bellagio boutiques off the Conservatory corridor — first-pass fill beside the anniversary stay.' },
  'Wynn Esplanade': { lat: 36.1265, lng: -115.1658, summary: 'Wynn luxury esplanade — first-pass shopping name for the Stores dump.' },
  'Harmon Corner': { lat: 36.1079, lng: -115.1724, summary: 'Strip-front retail at Harmon — a first-pass walk-by shop block near Aria/Cosmo.' },
  'Shoppes at Mandalay Place': { lat: 36.0909, lng: -115.1765, summary: 'Sky-bridge shops between Mandalay Bay and Luxor — first-pass south-Strip retail.' },
  'Venetian Shoppes': { lat: 36.1213, lng: -115.1698, summary: 'Venetian shoppes off the Grand Canal — first-pass Stores catalog companion to Cosmopolitan shops.' },
  'Miracle Mile Shops': { lat: 36.1121, lng: -115.1761, summary: 'Planet Hollywood indoor mile of shops — first-pass Stores fill so the category meets the 10-name bar.' },
  'Bellagio Fountains': { lat: 36.1126, lng: -115.1767, summary: 'The lake show in front of Bellagio — first-pass rest-list landmark on the anniversary stay.' },
  'High Roller': { lat: 36.1174, lng: -115.1682, summary: 'LINQ observation wheel — first-pass Strip view, stored as a Rest-list Thing with coords for maps.' },
  'The Sphere': { lat: 36.1206, lng: -115.1618, summary: 'MSG Sphere at Venetian — first-pass Vegas spectacle on the Rest list, not an itinerary assignment.' },
  'Fremont Street Experience': { lat: 36.1709, lng: -115.1446, summary: 'Downtown canopy and zip-line corridor — first-pass off-Strip Rest fill.' },
  'Neon Museum': { lat: 36.1769, lng: -115.1356, summary: 'Boneyard of rescued Strip signs — first-pass downtown Rest-list museum.' },
  'Atomic Museum': { lat: 36.1147, lng: -115.1485, summary: 'Atomic testing history east of the Strip — first-pass Rest-list museum with coords for the category map.' },
  'Hoover Dam': { lat: 36.0163, lng: -114.7378, summary: 'Colorado River dam day trip — first-pass Rest-list outing, stored not invented at PDF time.' },
  'Red Rock Canyon': { lat: 36.1353, lng: -115.427, summary: 'West-side sandstone loop — first-pass outdoor Rest fill opposite the Strip itinerary.' },
  'STRAT SkyPod': { lat: 36.1475, lng: -115.156, summary: 'North Strip tower views — first-pass Rest-list observation deck.' },
  'Welcome to Fabulous Las Vegas Sign': { lat: 36.082, lng: -115.1728, summary: 'South Strip welcome sign — first-pass photo stop on the Rest dump.' },
  'LINQ Promenade': { lat: 36.1174, lng: -115.1712, summary: 'Open-air LINQ walk to the High Roller — first-pass Rest/shopping corridor.' },
  'O by Cirque du Soleil': { lat: 36.1126, lng: -115.1767, summary: 'Bellagio water Cirque — first-pass show name on the Rest list, not a saved story.' },
  'Absinthe': { lat: 36.1167, lng: -115.1743, summary: 'Caesars spiegeltent circus-variety show — first-pass Rest-list tickets name.' },
  'Lake of Dreams': { lat: 36.1266, lng: -115.1657, summary: 'Wynn lake show after dark — first-pass Rest-list spectacle with coords for maps.' },
  'High Tea Conservatory Walk': { lat: 36.1129, lng: -115.1764, summary: 'A slow Bellagio Conservatory walk with tea nearby — first-pass Rest fill beside the anniversary Conservatory story.' },
};

const FILL_BUCKET_META = {
  Restaurants: {
    kind: 'restaurant',
    category_name: 'Restaurant',
    category_id: 2,
    icon: '🍽️',
    baseId: 941000,
  },
  Stores: {
    kind: 'store',
    category_name: 'Store',
    category_id: 11,
    icon: '🛍️',
    baseId: 951000,
  },
  'Shows, Tours and the Rest': {
    kind: 'event',
    category_name: 'Attraction',
    category_id: 8,
    icon: '🎟️',
    baseId: 961000,
  },
};

function listBucketForPlace(place = {}) {
  const cat = String(place.category_name || place.category?.name || place.category || '').toLowerCase();
  if (cat.includes('restaurant')) return 'Restaurants';
  if (cat.includes('store') || cat.includes('shop')) return 'Stores';
  if (cat.includes('hotel') || cat.includes('lodging')) return 'Hotels';
  if (cat.includes('flight') || cat.includes('transport') || cat.includes('car')) return null;
  return 'Shows, Tours and the Rest';
}

/**
 * Pad shared.places + thingOverrides so Style one / Style two Ae() de(false) lists
 * meet first-pass mins. Extras are Thing-stored (summary + coords). Hotels are not filled.
 */
export function padKeepsakeSharedPlaces(shared = {}) {
  const next = {
    ...shared,
    places: Array.isArray(shared.places) ? shared.places.map((place) => ({ ...place })) : [],
    thingOverrides: shared.thingOverrides && typeof shared.thingOverrides === 'object'
      ? { ...shared.thingOverrides }
      : {},
  };
  const existingByBucket = {
    Restaurants: [],
    Stores: [],
    'Shows, Tours and the Rest': [],
  };
  for (const place of next.places) {
    const bucket = listBucketForPlace(place);
    if (existingByBucket[bucket]) existingByBucket[bucket].push(place);
  }
  for (const [bucket, meta] of Object.entries(FILL_BUCKET_META)) {
    const extras = padKeepsakeListNames(bucket, existingByBucket[bucket] || []);
    extras.forEach((name, index) => {
      const detail = KEEPSAKE_FILL_DETAILS[name] || {};
      const id = meta.baseId + index + 1;
      const lat = Number(detail.lat) || 36.1147;
      const lng = Number(detail.lng) || -115.1729;
      const summary = detail.summary || `${name} — Las Vegas first-pass catalog.`;
      next.places.push({
        id,
        name,
        __tsKeepsakeFill: 1,
        category_id: meta.category_id,
        category_name: meta.category_name,
        category: { id: meta.category_id, name: meta.category_name, icon: meta.icon },
        category_icon: meta.icon,
        lat,
        lng,
        address: 'Las Vegas',
        notes: summary,
        description: summary,
      });
      next.thingOverrides[`place:${id}`] = {
        ...(next.thingOverrides[`place:${id}`] || {}),
        title: name,
        category: meta.kind,
        summary,
        longDetails: summary,
        lat,
        lng,
        timeline: false,
      };
    });
  }
  return next;
}
