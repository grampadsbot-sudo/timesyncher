import { useEffect, useState } from 'react';

export function BuildStampFooter() {
  const [stamp, setStamp] = useState('…');

  useEffect(() => {
    let cancelled = false;
    fetch('/api/version', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then((body: { sha?: string; build?: string } | null) => {
        if (cancelled) return;
        const raw = body?.sha || body?.build || '';
        if (!raw) {
          console.error('Build stamp missing from /api/version response');
          setStamp('unstamped');
          return;
        }
        setStamp(String(raw).slice(0, 7));
      })
      .catch((err) => {
        console.error('Build stamp fetch failed', err);
        if (!cancelled) setStamp('unstamped');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <footer className="tsv-build-footer no-print" data-build-stamp="1">
      {stamp}
    </footer>
  );
}
