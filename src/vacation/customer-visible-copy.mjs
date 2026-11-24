export function sayVacationNotTrip(text) {
  return String(text || '').replace(/(https?:\/\/\S+)|(\btrips?\b(?!\.com\b))/gi, (full, url, word) => {
    if (url) return url;
    const plural = /s$/i.test(word);
    const base = plural ? 'vacations' : 'vacation';
    if (word === word.toUpperCase()) return base.toUpperCase();
    if (word[0] === word[0].toUpperCase()) return base[0].toUpperCase() + base.slice(1);
    return base;
  });
}
