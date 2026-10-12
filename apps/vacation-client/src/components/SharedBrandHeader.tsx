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
        className="ts-logo"
        src="/icons/timesyncher-icon-black-transparent.png"
        alt=""
        width={22}
        height={22}
        decoding="sync"
        loading="eager"
        data-ts-header-logo="1"
      />
      <span>Vacation</span>
    </div>
  );
}
