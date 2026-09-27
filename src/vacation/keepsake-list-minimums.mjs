import { DEFAULT_FIRST_PASS_MINIMUMS } from '../../scripts/vacation-public-research-worker.mjs';
import { captureThingLogo } from './thing-logo-capture.mjs';

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
    'Carbone',
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

export function padKeepsakeListNames(bucket, existingRows = [], fill = KEEPSAKE_LIST_FILL) {
  const min = KEEPSAKE_LIST_MINIMUMS[bucket] || 0;
  const have = namesAlreadyListed(existingRows);
  const extras = (fill[bucket] || []).filter((name) => {
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

export function padLiveTabRows(_kind, existingRows = []) {
  return (Array.isArray(existingRows) ? existingRows : []).filter((row) => row && !row.__tsLiveFill);
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

/** Real Big Island catalog for timesyncherIntake trips. Vegas fill stays on the reference trip. */
export const BIG_ISLAND_LIST_FILL = {
  Restaurants: [
    "Huggo's",
    'Ulu Ocean Grill',
    "Merriman's Waimea",
    "Jackie Rey's Ohana Grill",
    'The Fish Hopper',
    'Kona Brewing Company',
    'Lava Lava Beach Club',
    "Quinn's Almost by the Sea",
    'Daylight Mind Coffee Company',
    'Manago Hotel Restaurant',
    'Cafe Pesto',
    "Brown's Beach House",
    'CanoeHouse',
    'Island Lava Java',
    'Pine Tree Cafe',
  ],
  Stores: [
    "Kings' Shops",
    "Queens' MarketPlace",
    'Kona Commons',
    'Hilo Hattie',
    'Keauhou Shopping Center',
    'Kona International Market',
    'KTA Super Stores',
    'Waimea Town Center',
    'Prince Kuhio Plaza',
    'Kona Inn Shopping Village',
  ],
  'Shows, Tours and the Rest': [
    'Hawaiʻi Volcanoes National Park',
    'Akaka Falls State Park',
    'Punaluʻu Black Sand Beach',
    'Hapuna Beach',
    'Mauna Kea Visitor Information Station',
    'Rainbow Falls',
    'Puʻuhonua o Hōnaunau',
    'Waipio Valley Lookout',
    'Kealakekua Bay',
    'Pololu Valley Lookout',
    'Kua Bay',
    'Kahaluʻu Beach Park',
    'Liliʻuokalani Gardens',
    'Kaloko-Honokohau National Historical Park',
    'Papakōlea Green Sand Beach',
  ],
};

export const BIG_ISLAND_FILL_DETAILS = {
  "Huggo's": { lat: 19.6394, lng: -155.9958, address: '75-5828 Kahakai Rd, Kailua-Kona', summary: "Kailua-Kona oceanfront dining on the rocks. Dinner and a bar with live music beside Aliʻi Drive." },
  'Ulu Ocean Grill': { lat: 19.9167, lng: -155.8869, address: 'Four Seasons Hualalai, Kaʻupulehu', summary: 'Beachfront restaurant at Four Seasons Hualalai. Hawaiian seafood with a published happy hour at the ocean bar.' },
  "Merriman's Waimea": { lat: 20.0231, lng: -155.6705, address: 'Opelo Plaza, Waimea', summary: 'Waimea farm-to-table dining room from Peter Merriman. A Kohala table, not a Kailua-Kona walk-in.' },
  "Jackie Rey's Ohana Grill": { lat: 19.6398, lng: -155.9902, address: '75-5995 Kuakini Hwy, Kailua-Kona', summary: 'Ohana grill on Kuakini Highway. Local plates and a family table in Kailua-Kona.' },
  'The Fish Hopper': { lat: 19.6402, lng: -155.9964, address: '75-5683 Aliʻi Dr, Kailua-Kona', summary: 'Aliʻi Drive seafood room with a harbor view. Lunch and dinner in Kailua-Kona.' },
  'Kona Brewing Company': { lat: 19.6391, lng: -155.9942, address: '74-5612 Pawai Pl, Kailua-Kona', summary: 'Kailua-Kona brewpub. Pizza, beer, and a casual table near the industrial park.' },
  'Lava Lava Beach Club': { lat: 19.9136, lng: -155.8864, address: '69-1081 Kuʻualiʻi Pl, Waikoloa', summary: 'Waikoloa beach club restaurant on ʻA-Bay. Toes-in-the-sand dining on the Kohala coast.' },
  "Quinn's Almost by the Sea": { lat: 19.6424, lng: -155.9961, address: '75-5655 Palani Rd, Kailua-Kona', summary: 'Palani Road fish and chips. A casual Kailua-Kona counter just up from the harbor.' },
  'Daylight Mind Coffee Company': { lat: 19.6396, lng: -155.9956, address: '75-5770 Aliʻi Dr, Kailua-Kona', summary: 'Aliʻi Drive coffee and brunch. A morning table before the waterfront walk.' },
  'Manago Hotel Restaurant': { lat: 19.4917, lng: -155.9217, address: '82-6155 Mamalahoa Hwy, Captain Cook', summary: 'Captain Cook family dining room at the Manago Hotel. Pork chops and a south-Kona supper.' },
  'Cafe Pesto': { lat: 19.7256, lng: -155.0876, address: '308 Kamehameha Ave, Hilo', summary: 'Hilo Bayfront pizza and pasta. A sit-down meal after the downtown Hilo walk.' },
  "Brown's Beach House": { lat: 19.8322, lng: -155.9884, address: 'Fairmont Orchid, Kohala Coast', summary: 'Fairmont Orchid beachfront dining. Kohala coast dinner with the lawn and the ocean.' },
  'CanoeHouse': { lat: 19.9484, lng: -155.8586, address: 'Mauna Lani, Kohala Coast', summary: 'Mauna Lani restaurant in the old canoe house. Kohala coast dinner, not a Kailua-Kona night.' },
  'Island Lava Java': { lat: 19.6392, lng: -155.9951, address: '75-5801 Aliʻi Dr, Kailua-Kona', summary: 'Aliʻi Drive breakfast and coffee. A Kailua-Kona morning table on the waterfront.' },
  'Pine Tree Cafe': { lat: 19.6378, lng: -155.9876, address: '73-4354 Mamalahoa Hwy, Kailua-Kona', summary: 'Kailua-Kona plate-lunch counter. Local breakfast and lunch on the highway.' },
  "Kings' Shops": { lat: 19.9272, lng: -155.8868, address: '69-250 Waikoloa Beach Dr, Waikoloa', summary: 'Waikoloa Beach Resort shops. Kohala coast retail between the hotels.' },
  "Queens' MarketPlace": { lat: 19.9138, lng: -155.8806, address: '69-201 Waikoloa Beach Dr, Waikoloa', summary: 'Waikoloa open-air shops and market. A Kohala coast retail stop.' },
  'Kona Commons': { lat: 19.6494, lng: -155.9944, address: '75-5591 Palani Rd, Kailua-Kona', summary: 'Kailua-Kona shopping center on Palani Road. Everyday stores above the harbor.' },
  'Hilo Hattie': { lat: 19.7062, lng: -155.0658, address: 'Prince Kuhio Plaza, Hilo', summary: 'Hilo aloha-wear shop at Prince Kuhio Plaza. A Hilo retail stop.' },
  'Keauhou Shopping Center': { lat: 19.5734, lng: -155.9618, address: '78-6831 Aliʻi Dr, Keauhou', summary: 'Keauhou retail center south of Kailua-Kona. Groceries and shops on Aliʻi Drive.' },
  'Kona International Market': { lat: 19.6488, lng: -156.0002, address: '74-5533 Luhia St, Kailua-Kona', summary: 'Covered market stalls in Kailua-Kona. Local goods off the highway.' },
  'KTA Super Stores': { lat: 19.6399, lng: -155.9854, address: '74-5594 Palani Rd, Kailua-Kona', summary: 'Kailua-Kona grocery. The house-stocking store for a Kona stay.' },
  'Waimea Town Center': { lat: 20.0228, lng: -155.6678, address: '65-1158 Mamalahoa Hwy, Waimea', summary: 'Waimea town shops on the highway. Upcountry retail in Kamuela.' },
  'Prince Kuhio Plaza': { lat: 19.6974, lng: -155.0632, address: '111 E Puainako St, Hilo', summary: 'Hilo mall. The main indoor shopping center on the Hilo side.' },
  'Kona Inn Shopping Village': { lat: 19.6393, lng: -155.9946, address: '75-5744 Aliʻi Dr, Kailua-Kona', summary: 'Aliʻi Drive shops in the old Kona Inn. Waterfront retail in Kailua-Kona.' },
  'Hawaiʻi Volcanoes National Park': { lat: 19.4194, lng: -155.2885, address: 'Hawaii Volcanoes National Park', summary: 'Kīlauea and the national park on the volcano. A full-day outing from Kailua-Kona.' },
  'Akaka Falls State Park': { lat: 19.8542, lng: -155.1534, address: 'Akaka Falls Rd, Honomu', summary: 'Hāmākua coast waterfall loop. A short paved walk to the falls.' },
  'Punaluʻu Black Sand Beach': { lat: 19.1364, lng: -155.5053, address: 'Punaluʻu, Kaʻū', summary: 'Kaʻū black sand beach. Turtles and the south-shore stop on the way to the volcano.' },
  'Hapuna Beach': { lat: 19.9916, lng: -155.8264, address: 'Hapuna Beach State Recreation Area', summary: 'Kohala white-sand beach. A swim day on the west coast.' },
  'Mauna Kea Visitor Information Station': { lat: 19.7603, lng: -155.4564, address: 'Mauna Kea Access Rd', summary: 'Onizuka Center at 9,200 feet. Stargazing and the summit road from there.' },
  'Rainbow Falls': { lat: 19.7194, lng: -155.1106, address: 'Waiānuenue Ave, Hilo', summary: 'Hilo waterfall at Waiānuenue. A short stop above the bayfront.' },
  'Puʻuhonua o Hōnaunau': { lat: 19.4219, lng: -155.9103, address: 'Hōnaunau', summary: 'Place of Refuge on the south Kona coast. The royal grounds and the cove.' },
  'Waipio Valley Lookout': { lat: 20.1182, lng: -155.5884, address: 'Waipio Valley Rd, Honokaʻa', summary: 'Lookout above Waipiʻo Valley. The Hāmākua view, not a drive down the road.' },
  'Kealakekua Bay': { lat: 19.4772, lng: -155.9217, address: 'Napoʻopoʻo, Captain Cook', summary: 'South Kona bay at Captain Cook. Clear water and the monument across the bay.' },
  'Pololu Valley Lookout': { lat: 20.2036, lng: -155.7334, address: 'Akoni Pule Hwy, North Kohala', summary: 'North Kohala lookout at the end of the highway. Valley and cliff view.' },
  'Kua Bay': { lat: 19.8102, lng: -156.0086, address: 'Maniniʻowali, Kekaha Kai', summary: 'Maniniʻowali white-sand cove. A swim beach north of the airport.' },
  'Kahaluʻu Beach Park': { lat: 19.5804, lng: -155.9622, address: '78-6625 Aliʻi Dr, Keauhou', summary: 'Keauhou snorkel cove on Aliʻi Drive. A shallow swim south of Kailua-Kona.' },
  'Liliʻuokalani Gardens': { lat: 19.7272, lng: -155.0668, address: 'Banyan Dr, Hilo', summary: 'Hilo bayfront Japanese garden. A quiet walk on Banyan Drive.' },
  'Kaloko-Honokohau National Historical Park': { lat: 19.6788, lng: -156.0236, address: 'Honokōhau, Kailua-Kona', summary: 'National historical park north of Kailua-Kona. Fishponds and the coast trail.' },
  'Papakōlea Green Sand Beach': { lat: 18.9364, lng: -155.6464, address: 'Kaʻū', summary: 'Green sand beach at South Point. A long Kaʻū hike, not a Kailua-Kona afternoon.' },
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
function catalogForShared(shared = {}) {
  if (shared.timesyncherIntake === true) {
    return {
      fill: BIG_ISLAND_LIST_FILL,
      details: BIG_ISLAND_FILL_DETAILS,
      fallbackAddress: 'Kailua-Kona, Hawaii',
      fallbackLat: 19.64,
      fallbackLng: -155.996,
    };
  }
  return {
    fill: KEEPSAKE_LIST_FILL,
    details: KEEPSAKE_FILL_DETAILS,
    fallbackAddress: 'Las Vegas',
    fallbackLat: 36.1147,
    fallbackLng: -115.1729,
  };
}

export function padKeepsakeSharedPlaces(shared = {}) {
  const catalog = catalogForShared(shared);
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
    const extras = padKeepsakeListNames(bucket, existingByBucket[bucket] || [], catalog.fill);
    extras.forEach((name, index) => {
      const detail = catalog.details[name] || {};
      const id = meta.baseId + index + 1;
      const lat = Number(detail.lat) || catalog.fallbackLat;
      const lng = Number(detail.lng) || catalog.fallbackLng;
      const summary = detail.summary || `${name} — ${catalog.fallbackAddress} first-pass catalog.`;
      const address = detail.address || catalog.fallbackAddress;
      const happyHour = /Ulu Ocean Grill/i.test(name);
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
        address,
        notes: summary,
        description: summary,
        logoUrl: captureThingLogo({ name }, { title: name, category: meta.kind }),
      });
      next.thingOverrides[`place:${id}`] = {
        ...(next.thingOverrides[`place:${id}`] || {}),
        title: name,
        category: meta.kind,
        summary,
        longDetails: summary,
        lat,
        lng,
        address,
        timeline: false,
        happyHour: happyHour ? true : undefined,
        happyHourDetails: happyHour ? 'Ocean bar happy hour at Ulu Ocean Grill, Four Seasons Hualalai.' : undefined,
        logoUrl: captureThingLogo({ name }, { title: name, category: meta.kind }),
      };
    });
  }
  return next;
}
