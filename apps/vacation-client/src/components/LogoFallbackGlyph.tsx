import { useLayoutEffect, useRef } from 'react';
import { paintCenteredEmoji } from '../lib/paintTabEmoji';

type Props = {
  glyph: string;
};

export function LogoFallbackGlyph({ glyph }: Props) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node || !glyph) return;
    const paint = () => {
      const box = node.getBoundingClientRect();
      const css = box.width > 0 ? box.width : 18;
      const fontPx = Number.parseFloat(getComputedStyle(node).fontSize) || 13;
      paintCenteredEmoji(node, glyph, css, fontPx);
    };
    paint();
    const frame = requestAnimationFrame(paint);
    const chip = node.closest('.tsv-logo-chip');
    let observer: ResizeObserver | null = null;
    if (chip && typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => paint());
      observer.observe(chip);
    }
    let dprQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    const onResolutionChange = () => {
      paint();
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
  }, [glyph]);

  return (
    <span className="tsv-logo-fallback" style={{ position: 'relative' }}>
      <canvas
        ref={ref}
        width={18}
        height={18}
        aria-hidden="true"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }}
      />
    </span>
  );
}
