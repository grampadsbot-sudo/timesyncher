export function adminViewsStatus(vacation, snapshots) {
  const missing = [];
  if (!Array.isArray(vacation?.turns)) missing.push('dialog');
  if (!Array.isArray(snapshots)) missing.push('turns');
  return { missing };
}
