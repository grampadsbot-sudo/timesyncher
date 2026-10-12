import { brandIconUrl } from '../lib/brandIconUrl';

/** Visible TREK header lockup (Gate B centred-logos / header logo structure checks). */
export function SharedBrandHeader() {
  return (
    <div
      className="tsv-shared-header-brand"
      data-brand-lockup="timesyncher-hourglass-vacation"
      data-hourglass-between="1"
    >
      <span>TimeSyncher</span>
      <img
        className="ts-logo tiny-logo"
        src={brandIconUrl}
        alt="TimeSyncher"
        width={22}
        height={22}
      />
      <span>Vacation</span>
    </div>
  );
}
