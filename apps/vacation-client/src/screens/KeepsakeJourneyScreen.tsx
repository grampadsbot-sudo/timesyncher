import { useEffect, useMemo } from 'react';
import type { SharedTripPayload } from '../types/sharedTrip';
import { buildKeepsakeViewModel } from '../lib/keepsakeModel.mjs';
import { DayMap } from '../components/DayMap';
import { BuildStampFooter } from '../components/BuildStampFooter';
import {
  KeepsakeDailyPage,
  KeepsakeDirectoryRow,
  KeepsakeLogoFooter,
  KeepsakePrintBrand,
  KeepsakeStoryCard,
} from '../components/KeepsakeBlocks';

type Props = {
  trip: SharedTripPayload;
  shareToken: string;
};

const KS_QUERY_KEYS = [
  'ksLogo',
  'ksSummary',
  'ksEventSummary',
  'ksStories',
  'ksRestaurants',
  'ksRest',
  'ksStores',
  'ksMapOff',
];

function useSearchParams() {
  return useMemo(() => new URLSearchParams(window.location.search), []);
}

function pdfPathWithConfig(pathname: string, params: URLSearchParams, extra: Record<string, string>) {
  const url = new URL(pathname, 'http://local');
  for (const [key, value] of Object.entries(extra)) url.searchParams.set(key, value);
  for (const key of KS_QUERY_KEYS) {
    const value = params.get(key);
    if (value != null && value !== '') url.searchParams.set(key, value);
  }
  return `${url.pathname}${url.search}`;
}

export function KeepsakeJourneyScreen({ trip, shareToken }: Props) {
  const params = useSearchParams();
  const model = useMemo(() => buildKeepsakeViewModel(trip, params), [trip, params]);

  useEffect(() => {
    document.documentElement.setAttribute('data-ts-keepsake', '1');
    document.documentElement.setAttribute('data-keepsake-style', String(model.style));
    if (params.get('printMode') === 'report') {
      document.body.setAttribute('data-ae-print', '1');
    }
    if (model.style === 2) {
      document.body.setAttribute('data-print-ready', 'style2');
    } else {
      document.body.setAttribute('data-print-ready', 'keepsake');
    }
    const slug = encodeURIComponent(shareToken);
    const orderHref = `/api/keepsake-order?slug=${slug}`;
    let orderLink = document.querySelector<HTMLAnchorElement>('a[data-keepsake-order="1"]');
    if (!orderLink) {
      orderLink = document.createElement('a');
      orderLink.href = orderHref;
      orderLink.textContent = 'Order Keepsakes';
      orderLink.setAttribute('aria-label', 'Order Keepsakes');
      orderLink.setAttribute('data-keepsake-order', '1');
      orderLink.className = 'tsv-keepsake-order';
      document.body.appendChild(orderLink);
    } else {
      orderLink.href = orderHref;
    }
    return () => {
      document.documentElement.removeAttribute('data-ts-keepsake');
      document.documentElement.removeAttribute('data-keepsake-style');
      document.body.removeAttribute('data-ae-print');
      document.body.removeAttribute('data-print-ready');
    };
  }, [model.style, params, shareToken]);

  useEffect(() => {
    const root = document.querySelector('.tsv-keepsake-root');
    if (!root) return;
    const pages = root.querySelectorAll('.tsv-keepsake-page');
    const total = pages.length;
    pages.forEach((page, index) => {
      let footer = page.querySelector('.tsv-keepsake-page-count');
      if (!footer) {
        footer = document.createElement('div');
        footer.className = 'tsv-keepsake-page-count muted page-count';
        page.appendChild(footer);
      }
      footer.textContent = `Page ${index + 1} of ${total}`;
    });
  }, [model]);

  const printKeepsakeHref = pdfPathWithConfig(
    `/api/pdf/shared/${encodeURIComponent(shareToken)}/report/keepsake.pdf`,
    params,
    { pdfReport: 'keepsake' },
  );
  const printStyleTwoHref = pdfPathWithConfig(
    `/api/pdf/shared/${encodeURIComponent(shareToken)}/report/style-2`,
    params,
    { pdfReport: 'keepsake-style-2' },
  );

  const directorySections = model.sections.filter((s) => s.kind === 'directory');
  const contentSections = model.sections.filter((s) => s.kind !== 'directory');
  const lastDirectoryIndex = directorySections.length - 1;

  return (
    <div
      className={`tsv-keepsake-root${model.style === 2 ? ' tsv-keepsake-style2' : ' tsv-keepsake-style1'}`}
      data-keepsake-journey="1"
      data-keepsake-style={String(model.style)}
    >
      <div className="tsv-keepsake-toolbar no-print">
        <a href={printKeepsakeHref}>Style one PDF</a>
        <a href={printStyleTwoHref}>Style two PDF</a>
      </div>

      <article className="tsv-keepsake-page tsv-keepsake-cover keepsake-report">
        <KeepsakePrintBrand tripTitle={model.tripTitle} style={model.style} />
        {model.sections.find((s) => s.kind === 'summary') ? (
          <p className="tsv-muted">Trip summary</p>
        ) : null}
      </article>

      {contentSections.map((section, index) => {
        if (section.kind === 'summary') {
          return (
            <section
              key={`summary-${index}`}
              className="tsv-keepsake-page keepsake-report"
              data-keepsake-section="summary"
            >
              <KeepsakePrintBrand tripTitle={model.tripTitle} style={model.style} />
              {section.summary.split(/\n\s*\n/).map((part, partIndex) => (
                <p key={`summary-part-${partIndex}`} className="tsv-keepsake-summary">
                  {part}
                </p>
              ))}
            </section>
          );
        }
        if (section.kind === 'event-summary') {
          return (
            <section
              key={`events-${index}`}
              className="tsv-keepsake-page keepsake-report"
              data-keepsake-section="event-summary"
            >
              <KeepsakePrintBrand tripTitle={model.tripTitle} style={model.style} />
              <p className="tsv-keepsake-summary">{section.label}</p>
            </section>
          );
        }
        if (section.kind === 'stats') {
          return (
            <section
              key={`stats-${index}`}
              className="tsv-keepsake-page keepsake-report"
              data-summary-itinerary="1"
            >
              <KeepsakePrintBrand tripTitle={model.tripTitle} style={model.style} />
              <div className="tsv-keepsake-stat-grid">
                {section.stats.map((row) => (
                  <div key={row.label} className="tsv-keepsake-stat" data-summary-itinerary="1">
                    <strong>{row.count}</strong>
                    {row.label}
                  </div>
                ))}
              </div>
            </section>
          );
        }
        if (section.kind === 'stories') {
          return (
            <section
              key={`stories-${index}`}
              className="tsv-keepsake-page keepsake-report keepsake-list-page"
              data-keepsake-section="saved-stories"
              data-stories-two-col="1"
              data-stories-packed="1"
            >
              <KeepsakePrintBrand tripTitle={model.tripTitle} style={model.style} />
              <h2>Saved stories</h2>
              <div className="tsv-keepsake-stories recap-grid">
                {section.stories.map((story) => (
                  <KeepsakeStoryCard key={String(story.id)} story={story} />
                ))}
              </div>
            </section>
          );
        }
        if (section.kind === 'daily-maps') {
          return (
            <section
              key={`maps-${index}`}
              className="tsv-keepsake-page keepsake-report"
              data-keepsake-section="daily-maps"
            >
              <KeepsakePrintBrand tripTitle={model.tripTitle} style={model.style} />
              <h2>Daily maps</h2>
              {section.maps.map((mapPage) => (
                <div
                  key={mapPage.dayNumber}
                  className="tsv-keepsake-day-map-block daily-map-page"
                  data-day-map-page="1"
                  data-config-map="1"
                  data-day={String(mapPage.dayNumber)}
                >
                  <h3>{mapPage.dayTitle} map</h3>
                  <DayMap places={mapPage.places} trip={trip} hideHeading />
                </div>
              ))}
            </section>
          );
        }
        if (section.kind === 'daily-itinerary') {
          return section.days.map((dayPage) => (
            <KeepsakeDailyPage
              key={String(dayPage.day.id)}
              trip={trip}
              tripTitle={model.tripTitle}
              style={model.style}
              dayPage={dayPage}
            />
          ));
        }
        return null;
      })}

      {directorySections.map((section, index) => {
        if (section.kind !== 'directory') return null;
        const isLast = index === lastDirectoryIndex;
        return (
          <section
            key={`dir-${section.tab}`}
            className="tsv-keepsake-page keepsake-report keepsake-list-page"
            data-directory-bucket={section.label}
            data-summary-itinerary="1"
            data-post-itinerary="1"
            data-end-continuous={isLast ? '1' : undefined}
          >
            <KeepsakePrintBrand tripTitle={model.tripTitle} style={model.style} />
            <h2>{section.label}</h2>
            <ul className="tsv-keepsake-logo-list logo-list">
              {section.items.map((item) => {
                const place = trip.places?.find((p) => String(p.id) === String(item.id));
                if (!place) return null;
                return (
                  <KeepsakeDirectoryRow key={String(item.id)} place={place} trip={trip} />
                );
              })}
            </ul>
            {isLast && model.logoSection ? <KeepsakeLogoFooter /> : null}
          </section>
        );
      })}

      {model.logoSection && directorySections.length === 0 ? (
        <section
          className="tsv-keepsake-page tsv-keepsake-logo-page keepsake-report"
          data-keepsake-section="logo"
          data-last-page-logo="1"
          data-logo-last-only="1"
        >
          <KeepsakePrintBrand tripTitle={model.tripTitle} style={model.style} />
          <KeepsakeLogoFooter />
        </section>
      ) : null}

      <BuildStampFooter />
    </div>
  );
}
