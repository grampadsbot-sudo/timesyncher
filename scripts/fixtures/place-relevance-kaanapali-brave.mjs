/**
 * Reconstructed Brave local candidates for offline tests.
 * Staging telemetry on build 522fa7b recorded Brave result counts and relevance_rejected_all
 * but did not persist per-candidate titles or addresses in transcript_turns.
 * BRAVE_SEARCH_API_KEY from Vercel staging env pull was a placeholder (not usable for live re-query).
 */
export const KAANAPALI_TACO_BRAVE_RESULTS = [
  {
    id: 'brave-jj-tacos-whalers',
    title: 'JJ Tacos',
    latitude: 20.9212,
    longitude: -156.6941,
    url: 'https://example.com/jj-tacos',
    postal_address: {
      streetAddress: '2435 Kaanapali Pkwy',
      addressLocality: 'Lahaina',
      addressRegion: 'HI',
    },
  },
  {
    id: 'brave-taco-zone',
    title: 'Taco Zone',
    latitude: 20.921236,
    longitude: -156.694173,
    url: 'https://example.com/taco-zone',
    postal_address: {
      streetAddress: 'Whalers Village Whale Pavilion',
      addressLocality: 'Kaanapali',
      addressRegion: 'HI',
    },
  },
  {
    id: 'brave-maui-tacos-kaanapali',
    title: 'Maui Tacos',
    latitude: 20.9208,
    longitude: -156.6935,
    url: 'https://example.com/maui-tacos',
    postal_address: {
      streetAddress: 'Kaanapali Parkway',
      addressLocality: 'Lahaina',
      addressRegion: 'HI',
    },
  },
  {
    id: 'brave-da-nani-pirates',
    title: "Da Nani Pirates",
    latitude: 20.9215,
    longitude: -156.6938,
    url: 'https://example.com/da-nani-pirates',
    postal_address: {
      streetAddress: '2435 Kaanapali Parkway',
      addressLocality: 'Lahaina',
      addressRegion: 'HI',
    },
  },
];

export const KAANAPALI_OFF_TARGET_BRAVE = {
  id: 'brave-home-depot-lahaina',
  title: 'The Home Depot',
  latitude: 20.8785,
  longitude: -156.6821,
  url: 'https://example.com/home-depot',
  postal_address: {
    streetAddress: '305 Hoolai St',
    addressLocality: 'Lahaina',
    addressRegion: 'HI',
  },
};
