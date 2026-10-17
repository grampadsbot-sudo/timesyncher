import { useEffect, useState } from 'react';

export function useResolvedLogo(candidates: string[]) {
  const primary = candidates[0] || '';
  const backup = candidates[1] || '';
  const [loadedPrimary, setLoadedPrimary] = useState('');

  useEffect(() => {
    if (!primary || primary === backup) return undefined;
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (!cancelled && img.naturalWidth > 0) setLoadedPrimary(primary);
    };
    img.src = primary;
    return () => {
      cancelled = true;
    };
  }, [primary, backup]);

  if (loadedPrimary === primary) return primary;
  return backup || primary;
}
