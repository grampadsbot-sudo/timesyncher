export function naturalFlightSummary(value) {
  const clock = '(?:(\\d{2}):(\\d{2})(?!\\s*[AaPp]\\.?\\s?[Mm](?![A-Za-z]))|(\\d{1,2}):(\\d{2})\\s*([AaPp])\\.?\\s?[Mm]\\.?(?![A-Za-z]))';
  const bareClock = clock.replace(/\((?!\?)/g, '(?:');
  const zone = '(?:\\s+(?:Eastern|Central|Mountain|Pacific|Alaska|Hawaii|local|[ECMP][SD]?T|UTC|GMT)(?:\\s+time)?)?';
  const parts = [
    [5, 'overnight', 'overnight'],
    [9, 'in the early morning', 'early-morning'],
    [12, 'in the late morning', 'late-morning'],
    [14, 'around midday', 'midday'],
    [15, 'in the early afternoon', 'early-afternoon'],
    [18, 'in the late afternoon', 'late-afternoon'],
    [21, 'in the evening', 'evening'],
    [24, 'late at night', 'late-night'],
  ];
  const hourOf = (h24, m24, h12, m12, meridiem) => {
    if (h24 != null) {
      const hour = Number(h24);
      return hour <= 23 && Number(m24) <= 59 ? hour : -1;
    }
    let hour = Number(h12);
    if (!(hour >= 1 && hour <= 12) || Number(m12) > 59) return -1;
    const pm = /p/i.test(meridiem);
    if (hour === 12) hour = pm ? 12 : 0;
    else if (pm) hour += 12;
    return hour;
  };
  const partOf = (hour) => parts.find(([end]) => hour < end);
  const stored = String(value ?? '');
  if (!new RegExp(bareClock).test(stored) && !/\bcovers\b/.test(stored)) return stored;
  let text = stored.replace(/\s+/g, ' ').trim();
  if (!text) return '';
  const range = `(?:\\d{4}-\\d{2}-\\d{2}\\s+)?${bareClock}${zone}\\s*[–—-]\\s*${bareClock}${zone}(?:\\s*\\+\\d)?`;
  const lead = text.match(new RegExp(`^(.+?)\\s+${range}\\s+covers\\s+`));
  if (lead) {
    const carrier = lead[1].replace(/\s+[A-Z]{3}\s*(?:→|->|–|-|to)\s*[A-Z]{3}\b.*$/, '').trim();
    text = `${carrier ? `${carrier} flies` : 'Flies'} from ${text.slice(lead[0].length)}`;
  }
  const miles = (n) => Number(n.replace(/,/g, '')).toLocaleString('en-US');
  text = text
    .replace(/\b(?:The|This) flight covers (?:about |roughly )?(\d[\d,]*) miles\b/g, (whole, n) => `It is a ${miles(n)}-mile trip`)
    .replace(/\bcovers (about |roughly )?(\d[\d,]*) miles\b/g, (whole, about, n) => `flies ${about || ''}${miles(n)} miles`)
    .replace(new RegExp(`\\(\\s*${range}\\s*\\)|${range}`, 'g'), ' ');
  text = text.replace(new RegExp(`\\b(?:at|around|by)\\s+${clock}${zone}`, 'g'), (whole, h24, m24, h12, m12, meridiem) => {
    const hour = hourOf(h24, m24, h12, m12, meridiem);
    return hour < 0 ? whole : partOf(hour)[1];
  });
  text = text.replace(new RegExp(`(\\b(?:[Tt]he|[Aa]n?|[Ii]ts|[Tt]heir|[Tt]his|[Tt]hat|[A-Za-z]+['’]s)\\s+)?\\b${clock}${zone}`, 'g'), (whole, det, h24, m24, h12, m12, meridiem) => {
    const hour = hourOf(h24, m24, h12, m12, meridiem);
    if (hour < 0) return whole;
    const [, adverb, adjective] = partOf(hour);
    if (!det) return adverb;
    const word = det.trim();
    if (/^an?$/i.test(word)) {
      const article = /^[aeiou]/i.test(adjective) ? 'an' : 'a';
      return `${word[0] === 'A' ? article[0].toUpperCase() + article.slice(1) : article} ${adjective}`;
    }
    return `${det}${adjective}`;
  });
  text = text
    .replace(/\(\s*\)/g, '')
    .replace(/\s+([,.;:])/g, '$1')
    .replace(/([,;:])(?=[,.;:])/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}
