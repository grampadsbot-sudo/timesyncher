/**
 * Staging transcript 9833b82f (best tacos near our hotel, 2026-10-02) stored these
 * Brave titles with empty addresses. They are Ziguinchor / Casamance hits, not Maui tacos.
 * Check 6 (6c2a042e) stored Brave resultCount 1 and did not persist that row's title.
 */
export const STAGING_HOTEL_BRAVE_REJECTIONS = [
  { title: 'Fast-food Lateranga', address: '', reason: 'relevance_below_minimum_2.63' },
  { title: 'Hotel Kadiandoumagne', address: '', reason: 'relevance_below_minimum_1.74' },
  { title: 'Camping Casamance', address: '', reason: 'relevance_below_minimum_1.16' },
  { title: 'LA CASA MANDELA', address: '', reason: 'relevance_below_minimum_2.46' },
  { title: 'Restaurant Ola', address: '', reason: 'relevance_below_minimum_2.68' },
];

export const KAANAPALI_ON_TARGET_BRAVE = [
  {
    id: 'brave-on-target-taco',
    title: 'Whalers Village Tacos',
    latitude: 20.9212,
    longitude: -156.6941,
    url: 'https://example.com/whalers-tacos',
    postal_address: {
      streetAddress: '2435 Kaanapali Pkwy',
      addressLocality: 'Lahaina',
      addressRegion: 'HI',
    },
  },
];

export const KAANAPALI_TACO_BRAVE_RESULTS = [
  ...KAANAPALI_ON_TARGET_BRAVE,
  ...STAGING_HOTEL_BRAVE_REJECTIONS.map((row, index) => ({
    id: `staging-off-target-${index + 1}`,
    title: row.title,
    latitude: 20.922,
    longitude: -156.693,
    url: '',
    postal_address: {},
  })),
];

export const KAANAPALI_OFF_TARGET_BRAVE = {
  id: 'staging-off-target-3',
  title: 'Camping Casamance',
  latitude: 20.922,
  longitude: -156.693,
  url: '',
  postal_address: {},
};

export const KAANAPALI_GEOCODE = {
  lat: '20.9250419',
  lon: '-156.6899009',
  display_name: 'Kaanapali, Maui County, Hawaii, 96761, United States',
  address: {
    town: 'Kaanapali',
    county: 'Maui County',
    state: 'Hawaii',
    country_code: 'us',
  },
};

export const LODGING_LOCALITY = 'Kaanapali, Maui';
