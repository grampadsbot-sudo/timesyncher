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
        setStamp(raw ? String(raw).slice(0, 7) : 'preview');
      })
      .catch(() => {
        if (!cancelled) setStamp('preview');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <footer className="tsv-build-footer" data-build-stamp="1">
      {stamp}
    </footer>
  );
}
