import { useEffect, useRef, useState } from 'react';
import type { McpPreviewMedia } from '../api/mcpAdmin';

type ViewerWindow = Window & {
  __tsOpenMediaViewer?: (args: {
    items: Array<{ url: string; media_kind?: string; mime_type?: string; poster_url?: string | null; caption?: string | null }>;
    startIndex: number;
    title: string;
  }) => void;
  __tsPicFsActive?: boolean;
};

type Props = {
  items: McpPreviewMedia[];
  ownerLabel: string;
  scope: 'thing' | 'day' | 'skipped';
};

function resolveMediaUrl(item: McpPreviewMedia) {
  const direct = String(item.url || item.preview_url || '').trim();
  if (direct) return direct;
  return item.media_id ? `/api/mcp/media/${encodeURIComponent(item.media_id)}` : '';
}

function isVideoEntry(item: McpPreviewMedia) {
  const kind = String(item.media_kind || '').toLowerCase();
  const mime = String(item.mime_type || '').toLowerCase();
  const url = resolveMediaUrl(item);
  return kind === 'video' || mime.startsWith('video/') || /\.(mp4|mov|webm|m4v)(\?|#|$)/i.test(url);
}

function posterForVideo(item: McpPreviewMedia, url: string) {
  const poster = String(item.poster_url || item.thumbnail_url || '').trim();
  return poster && poster !== url ? poster : undefined;
}

function videoThumbSrc(url: string, poster?: string) {
  if (poster || !url || url.startsWith('data:') || url.includes('#')) return url;
  return `${url}#t=0.1`;
}

export function PreviewMediaThumbs({ items, ownerLabel, scope }: Props) {
  const [fallbackIdx, setFallbackIdx] = useState<number | null>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  const normalized = items
    .map((item) => {
      const url = resolveMediaUrl(item);
      if (!url) return null;
      return {
        media_id: item.media_id,
        url,
        media_kind: isVideoEntry(item) ? 'video' : 'photo',
        mime_type: item.mime_type || (isVideoEntry(item) ? 'video/mp4' : 'image/jpeg'),
        poster_url: posterForVideo(item, url) || null,
        caption: item.caption || null,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

  useEffect(() => {
    if (fallbackIdx === null) return;
    const win = window as ViewerWindow;
    win.__tsPicFsActive = true;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        event.preventDefault();
        setFallbackIdx(null);
      } else if (event.key === 'ArrowRight' && normalized.length > 1) {
        event.stopPropagation();
        event.preventDefault();
        setFallbackIdx((prev) => (prev === null ? null : (prev + 1) % normalized.length));
      } else if (event.key === 'ArrowLeft' && normalized.length > 1) {
        event.stopPropagation();
        event.preventDefault();
        setFallbackIdx((prev) => (prev === null ? null : (prev - 1 + normalized.length) % normalized.length));
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      win.__tsPicFsActive = false;
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [fallbackIdx, normalized.length]);

  if (!normalized.length) return null;

  function openAt(index: number) {
    const win = window as ViewerWindow;
    if (typeof win.__tsOpenMediaViewer === 'function') {
      win.__tsOpenMediaViewer({ items: normalized, startIndex: index, title: ownerLabel });
      return;
    }
    setFallbackIdx(index);
  }

  const active = fallbackIdx !== null ? normalized[fallbackIdx] : null;

  return (
    <>
      <div className="tsv-mcp-thumb-strip" data-ts-media-strip={scope} data-ts-media-owner={ownerLabel}>
        {normalized.map((entry, idx) => {
          const video = entry.media_kind === 'video';
          const poster = entry.poster_url || undefined;
          return (
            <button
              key={`${entry.media_id}-${idx}`}
              type="button"
              className={`tsv-mcp-thumb${video ? ' is-video' : ''}`}
              data-ts-preview-thumb="1"
              data-media-id={entry.media_id}
              data-media-kind={entry.media_kind}
              aria-label={video ? `Play video for ${ownerLabel}` : `View photo for ${ownerLabel}`}
              onClick={() => openAt(idx)}
            >
              {video ? (
                <>
                  <video
                    className="tsv-mcp-thumb-media"
                    src={videoThumbSrc(entry.url, poster)}
                    poster={poster}
                    muted
                    playsInline
                    preload="metadata"
                    aria-hidden="true"
                  />
                  <span className="tsv-mcp-thumb-play" data-ts-media-play-badge="1" aria-hidden="true">
                    ▶
                  </span>
                </>
              ) : (
                <img className="tsv-mcp-thumb-media" src={entry.url} alt={entry.caption || ownerLabel} loading="lazy" />
              )}
            </button>
          );
        })}
      </div>
      {active && fallbackIdx !== null ? (
        <div
          className="tsv-mcp-viewer-overlay"
          data-ts-pic-fs-overlay="1"
          role="dialog"
          aria-modal="true"
          aria-label={`Full screen media: ${ownerLabel}`}
          onClick={(event) => {
            if (event.target === event.currentTarget) setFallbackIdx(null);
          }}
          onTouchStart={(event) => {
            if (event.touches.length === 1) {
              touchStartRef.current = { x: event.touches[0].clientX, y: event.touches[0].clientY };
            }
          }}
          onTouchEnd={(event) => {
            if (!touchStartRef.current || !event.changedTouches.length || normalized.length <= 1) return;
            const dx = event.changedTouches[0].clientX - touchStartRef.current.x;
            const dy = event.changedTouches[0].clientY - touchStartRef.current.y;
            touchStartRef.current = null;
            if (Math.abs(dx) > 40 && Math.abs(dy) < 80) {
              setFallbackIdx((prev) =>
                prev === null ? null : (dx < 0 ? (prev + 1) % normalized.length : (prev - 1 + normalized.length) % normalized.length),
              );
            }
          }}
        >
          {normalized.length > 1 ? (
            <span className="tsv-mcp-viewer-counter" data-ts-pic-fs-counter="1">
              {fallbackIdx + 1} / {normalized.length}
            </span>
          ) : null}
          <button
            type="button"
            className="tsv-mcp-viewer-close"
            data-ts-pic-fs-exit="1"
            aria-label="Close full screen"
            onClick={() => setFallbackIdx(null)}
          >
            ×
          </button>
          {normalized.length > 1 ? (
            <button
              type="button"
              className="tsv-mcp-viewer-nav is-prev"
              data-ts-pic-fs-prev="1"
              aria-label="Previous"
              onClick={() => setFallbackIdx((fallbackIdx - 1 + normalized.length) % normalized.length)}
            >
              ‹
            </button>
          ) : null}
          <div className="tsv-mcp-viewer-stage" data-ts-pic-fs-stage="1">
            {active.media_kind === 'video' ? (
              <video
                key={active.url}
                className="tsv-mcp-viewer-media"
                data-ts-pic-fs-img="1"
                data-media-kind="video"
                data-media-index={String(fallbackIdx)}
                src={active.url}
                poster={active.poster_url || undefined}
                controls
                playsInline
                preload="metadata"
              />
            ) : (
              <img
                className="tsv-mcp-viewer-media"
                data-ts-pic-fs-img="1"
                data-media-kind="photo"
                data-media-index={String(fallbackIdx)}
                src={active.url}
                alt={active.caption || ownerLabel}
              />
            )}
          </div>
          {normalized.length > 1 ? (
            <button
              type="button"
              className="tsv-mcp-viewer-nav is-next"
              data-ts-pic-fs-next="1"
              aria-label="Next"
              onClick={() => setFallbackIdx((fallbackIdx + 1) % normalized.length)}
            >
              ›
            </button>
          ) : null}
          {active.caption || ownerLabel ? (
            <div className="tsv-mcp-viewer-caption" data-ts-pic-fs-caption="1">
              {active.caption || ownerLabel}
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
