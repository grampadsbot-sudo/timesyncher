const HOURS_PAGE_SIGNAL = /\b(?:opening\s+hours?|hours?\s+of\s+operation|open(?:ing)?(?:\s+(?:hours?|times?))?|(?:mon|tue|wed|thu|fri|sat|sun)[\w\-–,\s]{0,40}\d{1,2}(?::\d{2})?\s*(?:am|pm)|show\s*times?|set\s*times?|box\s+office|\d{1,2}(?::\d{2})?\s*(?:am|pm)\s*[–\-]\s*\d{1,2})\b/i;
const HAPPY_HOUR_PAGE_SIGNAL = /\bhappy\s*hour\b/i;

export function dossierPageMentionsHours(text = '') {
  return HOURS_PAGE_SIGNAL.test(String(text || ''));
}

function dossierPageMentionsHappyHour(text = '') {
  return HAPPY_HOUR_PAGE_SIGNAL.test(String(text || ''));
}

export function dossierHasHoursPageEvidence(dossier = {}) {
  return (dossier.pages || []).some((page) => dossierPageMentionsHours(page.text));
}

export function dossierHasHappyHourPageEvidence(dossier = {}) {
  return (dossier.pages || []).some((page) => dossierPageMentionsHappyHour(page.text));
}

export function supplementalHoursSearchTopics(place = {}, { wantHours = true, wantHappyHour = false } = {}) {
  const category = String(place.category || place.sourceRecord?.category || '').toLowerCase();
  const topics = [];
  if (wantHours) {
    topics.push({ q: 'official website opening hours', max: 5 });
    topics.push({ q: 'google maps yelp hours of operation', max: 5 });
    if (/hotel|lodg|inn|stay/.test(category)) topics.push({ q: 'hotel bar restaurant lounge hours', max: 4 });
    if (/music|jazz|club|theatre|show|ticket/.test(category)) {
      topics.push({ q: 'showtimes schedule set times box office hours', max: 4 });
    }
    if (/book|store|shop|grocery|market|food/.test(category)) {
      topics.push({ q: 'store hours open closed Sunday', max: 4 });
    }
  }
  if (wantHappyHour && /restaurant|bar/.test(category)) {
    topics.push({ q: 'happy hour drink specials times days menu', max: 4 });
  }
  return topics;
}
