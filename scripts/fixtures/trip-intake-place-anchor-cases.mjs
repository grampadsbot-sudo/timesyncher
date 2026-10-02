/** Classifier place_search anchor expectations (mocked in unit tests; live eval optional). */
export const TRIP_INTAKE_PLACE_ANCHOR_CASES = [
  {
    name: 'lodging_reference_near_our_hotel',
    text: 'best tacos near our hotel',
    extraction: {
      turnKind: 'place_search',
      target: 'tacos',
      category: 'restaurant',
      anchor: 'our hotel',
      anchorIsLodging: true,
      question: '',
      things: [],
      roster: [],
      destination: '',
      hasDates: false,
      title: '',
    },
    expectAnchorIsLodging: true,
  },
  {
    name: 'named_area_kaanapali',
    text: 'tacos near Kaanapali',
    extraction: {
      turnKind: 'place_search',
      target: 'tacos',
      category: 'restaurant',
      anchor: 'Kaanapali',
      anchorIsLodging: false,
      question: '',
      things: [],
      roster: [],
      destination: '',
      hasDates: false,
      title: '',
    },
    expectAnchorIsLodging: false,
  },
];
