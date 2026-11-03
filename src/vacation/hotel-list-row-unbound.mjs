function text(value, max = 4000) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

export function hotelListRowUnboundNarrative(title = '', address = '') {
  const name = text(title, 120) || 'This hotel';
  const area = text(address, 160) || 'the planned area';
  return text(
    `${name} is a planning row on the Hotels tab without a bound property identity for this trip. `
    + `Use it to compare stay options near ${area}, but verify the real hotel name, nightly rate, check-in rules, and guest reviews on an official listing before you book.`,
    4000,
  );
}

export function storedCcabHotelListNarrative(title = '', record = {}, helpers = {}) {
  const {
    text: textFn = text,
    narrativeWordCount = (value = '') => textFn(value).split(/\s+/).filter(Boolean).length,
    isHotelPlanningNote = () => false,
    isGenericDescription = () => false,
  } = helpers;
  const longRaw = textFn(record.longDetails || record.description);
  const summary = textFn(record.summary, 500);
  if (longRaw && !isHotelPlanningNote(longRaw) && narrativeWordCount(longRaw) >= 30) {
    return {
      summary: summary && !isGenericDescription(summary) ? summary : longRaw.split(/\s+/).slice(0, 12).join(' '),
      longDetails: longRaw,
      neighborhood: textFn(record.neighborhood, 160),
      websiteFlavour: textFn(record.websiteFlavour),
    };
  }
  const flavour = textFn(record.websiteFlavour);
  const built = flavour || summary;
  if (!built) return null;
  return {
    summary: built.split(/\s+/).slice(0, 12).join(' '),
    longDetails: built,
    neighborhood: textFn(record.neighborhood, 160),
    websiteFlavour: flavour,
  };
}
