export const NEGATIVE_PROOF_SHA = 'e9b1b447c3dc4a6a154725f76a78a3ba052c891a';

export function pr336FlightOnDay(dayIds, day) {
  const ids = Array.isArray(dayIds) ? dayIds.map(String) : [];
  return ids.length === 0
    || ids.includes(String(day.id))
    || ids.includes(String(day.day_number));
}
