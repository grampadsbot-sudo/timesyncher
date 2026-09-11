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
