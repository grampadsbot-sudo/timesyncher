/** Staging turn ff34530b — classifier should emit one hotel Thing. */
export const STAGING_HYATT_INTAKE_SENTENCE = 'We are staying at Hyatt Regency Maui in Kaanapali.';

export const STAGING_HYATT_INTAKE_EXTRACTION = {
  turnKind: 'trip_intake',
  target: '',
  anchor: '',
  anchorIsLodging: false,
  question: '',
  things: [{ name: 'Hyatt Regency Maui', kind: 'hotel', who: '', when: '' }],
  roster: [],
  destination: 'Kaanapali',
  hasDates: false,
  startDate: '',
  endDate: '',
  title: '',
};
