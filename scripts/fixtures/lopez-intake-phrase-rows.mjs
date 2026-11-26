export const LOPEZ_TRIP_TITLE = 'Orlando Theme Parks Family Trip';
export const LOPEZ_CUSTOMER_DISPLAY = 'Sofia Lopez';

export const lopezBadPhraseRows = [
  { id: 'a1', title: 'The Lake Buena Vista hotel', category: 'hotel', metadata: { source: 'chat_extraction' } },
  { id: 'a2', title: 'Lake Buena Vista hotel', category: 'hotel', metadata: { source: 'chat_extraction' } },
  { id: 'a3', title: 'family hotel or resort in Lake Buena Vista', category: 'hotel', metadata: { source: 'chat_extraction' } },
  { id: 'f1', title: 'Nothing has been booked', category: 'activity', metadata: { source: 'chat_extraction' } },
  { id: 'g1', title: 'simple snack after morning snack at Magic Kingdom', category: 'restaurant', metadata: { source: 'chat_extraction' } },
  { id: 'h1', title: 'Magic Kingdom parade', category: 'activity', metadata: { source: 'chat_extraction' } },
  { id: 'h2', title: 'Magic Kingdom afternoon parade', category: 'activity', metadata: { source: 'chat_extraction' } },
  { id: 'i1', title: 'rides between the Lake Buena Vista stay and the parks', category: 'car', metadata: { source: 'chat_extraction' } },
  { id: 'i2', title: 'rides between Lake Buena Vista stay and the parks', category: 'car', metadata: { source: 'chat_extraction' } },
  { id: 'j1', title: 'Delta options', category: 'flight', metadata: { source: 'chat_extraction' } },
  { id: 'j2', title: 'Delta or Southwest early departure flight option', category: 'flight', metadata: { source: 'chat_extraction' } },
  { id: 'j3', title: 'flight options outbound Monday April 5 morning landing Orlando International', category: 'flight', metadata: { source: 'chat_extraction' } },
  { id: 'j4', title: 'Southwest', category: 'flight', metadata: { source: 'chat_extraction' } },
];

export const lopezItineraryPhraseTitles = [
  'and nothing has been emailed.',
  'Nothing has been booked',
];

export const lopezGoodCustomerPlaceholder = {
  id: 'ok-blurb-event',
  title: 'Magic Kingdom Villains Spectacular',
  category: 'family_event',
  metadata: { source: 'long-intake', origin: 'customer_blurb', needsDetails: true },
};