function formatWelcomeDate(iso) {
  const value = String(iso || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return new Date(`${value}T12:00:00Z`).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  });
}

export function formatWelcomeDateRange(start, end) {
  const a = formatWelcomeDate(start);
  const b = formatWelcomeDate(end);
  if (a && b) return `${a} to ${b}`;
  return a || b || '';
}

export function welcomeNoteText(member, vacation) {
  const title = vacation.title || vacation.destination || vacation.label || '';
  const usedTitle = Boolean(String(vacation.title || vacation.label || '').trim());
  const place = !usedTitle && vacation.destination ? ` in ${vacation.destination}` : '';
  const dates = formatWelcomeDateRange(vacation.startDate, vacation.endDate);
  return `Welcome to ${member.customer_label}'s vacation. ${title}${place}${dates ? ` · ${dates}` : ''}.`;
}