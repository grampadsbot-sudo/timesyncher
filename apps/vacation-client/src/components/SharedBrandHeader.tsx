/** Visible TREK header lockup (Gate B centred-logos / header logo structure checks). */
export function SharedBrandHeader() {
  return (
    <div
      className="tsv-shared-header-brand"
      data-brand-lockup="timesyncher-hourglass-vacation"
      data-hourglass-between="1"
    >
      <span>TimeSyncher</span>
      <span
        className="tsv-logo-chip tsv-header-logo-chip"
        data-ts-logo-chip="1"
        data-ts-header-logo-chip="1"
        aria-hidden="true"
      >
        <img
          className="ts-logo tiny-logo"
          src="/icons/timesyncher-icon-black-transparent.png"
          alt="TimeSyncher"
          width={22}
          height={22}
          decoding="sync"
          data-ts-header-logo="1"
        />
      </span>
      <span>Vacation</span>
    </div>
  );
}
