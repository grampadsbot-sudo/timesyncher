export const BRAVE_DUMMY = 'place-intent-brave-key-aa11';
export const TAVILY_DUMMY = 'place-intent-tavily-key-bb22';
export const OPENROUTER_DUMMY = 'place-intent-openrouter-cc33';
export const ROUTER_MODEL = 'jev-router-test-model';

export const NOMINATIM_HOST = ['nominatim', 'openstreetmap', 'org'].join('.');
export const OVERPASS_HOST = ['overpass-api', 'de'].join('.');
export const BRAVE_HOST = ['api', 'search', 'brave', 'com'].join('.');
export const TAVILY_HOST = ['api', 'tavily', 'com'].join('.');
export const OPENROUTER_HOST = ['openrouter', 'ai'].join('.');

const emptyFields = {
  target: '',
  anchor: '',
  anchorIsLodging: false,
  targetKind: '',
  question: '',
  things: [],
  roster: [],
  destination: '',
  hasDates: false,
  title: '',
  inviteeName: '',
  inviteeEmail: '',
};

export function classifierPayloadForTurn(text, state) {
  const lower = String(text || '').toLowerCase();
  if (state.classifierMode === 'fail') return null;
  if (/weather|events/.test(lower)) {
    return { turnKind: 'web_research', ...emptyFields, question: text };
  }
  if (/land in maui/.test(lower)) {
    return { turnKind: 'other', ...emptyFields, destination: 'Maui' };
  }
  if (/taco|tacos/.test(lower)) {
    return {
      turnKind: 'place_search',
      ...emptyFields,
      target: 'tacos',
      category: 'restaurant',
      targetKind: 'category',
      anchor: /our hotel/.test(lower) ? 'our hotel' : 'Kaanapali Maui',
      anchorIsLodging: /our hotel/.test(lower),
    };
  }
  return { turnKind: 'other', ...emptyFields };
}
