import { useLayoutEffect, useRef } from 'react';
import { paintTabEmoji } from '../lib/paintTabEmoji';

type Props = {
  emoji: string;
  tabId: string;
  isActive: boolean;
};

export function TabEmojiIcon({ emoji, tabId, isActive }: Props) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const btn = node.closest('button');
    const paint = () => paintTabEmoji(node, emoji);
    paint();
    const frame = requestAnimationFrame(paint);
    let observer: ResizeObserver | null = null;
    if (btn && typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => paintTabEmoji(node, emoji));
      observer.observe(btn);
    }
    let dprQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    const onResolutionChange = () => {
      paintTabEmoji(node, emoji);
      dprQuery.removeEventListener('change', onResolutionChange);
      dprQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
      dprQuery.addEventListener('change', onResolutionChange);
    };
    dprQuery.addEventListener('change', onResolutionChange);
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      dprQuery.removeEventListener('change', onResolutionChange);
    };
  }, [emoji, isActive]);

  return (
    <span
      data-tab-category={tabId}
      data-ts-category-tab-icon="1"
      data-ts-logo-chip="1"
      className="tsv-tab-icon-chip"
      aria-hidden="true"
    >
      <span data-ts-tab-emoji="1" className="tsv-tab-emoji-wrap">
        <canvas ref={ref} width={32} height={32} className="tsv-tab-emoji-canvas" />
      </span>
    </span>
  );
}
