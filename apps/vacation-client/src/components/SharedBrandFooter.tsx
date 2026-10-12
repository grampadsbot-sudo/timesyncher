/** Matches served TREK shared-trip footer chrome (NYC reference screenshots). */
export function SharedBrandFooter() {
  return (
    <footer className="tsv-shared-footer" data-ts-shared-footer="1">
      <div
        className="tsv-shared-footer-brand"
        data-brand-lockup="timesyncher-hourglass-vacation"
        data-hourglass-between="1"
      >
        <span>TimeSyncher</span>
        <img
          className="ts-logo tiny-logo"
          src="/icons/timesyncher-icon-black-transparent.png"
          alt="TimeSyncher"
          width={22}
          height={22}
        />
        <span>Vacation</span>
        <span className="tsv-shared-footer-tagline">· AI-assisted vacation itinerary planning</span>
      </div>
    </footer>
  );
}
