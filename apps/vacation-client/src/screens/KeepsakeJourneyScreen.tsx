import { useEffect, useMemo } from 'react';
import type { SharedTripPayload } from '../types/sharedTrip';
import { buildKeepsakeViewModel } from '../lib/keepsakeModel.mjs';
import { DayMap } from '../components/DayMap';
import { BuildStampFooter } from '../components/BuildStampFooter';
import { BudgetLogoChip } from '../components/BudgetLogoChip';
import { timeRangeLabel } from '../lib/dayTimelineModel.mjs';

type Props = {
  trip: SharedTripPayload;
  shareToken: string;
};

function useSearchParams() {
  return useMemo(() => new URLSearchParams(window.location.search), []);
}

export function KeepsakeJourneyScreen({ trip, shareToken }: Props) {
  const params = useSearchParams();
  const model = useMemo(() => buildKeepsakeViewModel(trip, params), [trip, params]);

  useEffect(() => {
    document.documentElement.setAttribute('data-ts-keepsake', '1');
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
      document.body.removeAttribute('data-ae-print');
      document.body.removeAttribute('data-print-ready');
    };
  }, [model.style, params, shareToken]);

  const printKeepsakeHref = `/api/pdf/shared/${encodeURIComponent(shareToken)}/report/keepsake.pdf`;
  const printStyleTwoHref = `/api/pdf/shared/${encodeURIComponent(shareToken)}/report/style-2`;

  return (
    <div
      className="tsv-keepsake-root"
      data-keepsake-journey="1"
      data-keepsake-style={String(model.style)}
    >
      <div className="tsv-keepsake-toolbar no-print">
        <a href={printKeepsakeHref}>Style one PDF</a>
        <a href={printStyleTwoHref}>Style two PDF</a>
      </div>

      <article className="tsv-keepsake-page tsv-keepsake-cover">
        <p className="tsv-keepsake-brand">TimeSyncher · Keepsake</p>
        <h1>{model.tripTitle}</h1>
        {model.style === 2 ? <p className="tsv-muted">Style two</p> : null}
        {model.sections.find((s) => s.kind === 'summary') ? (
          <p className="tsv-muted">Trip summary</p>
        ) : null}
      </article>

      {model.sections.map((section, index) => {
        if (section.kind === 'summary') {
          return (
            <section
              key={`summary-${index}`}
              className="tsv-keepsake-page"
              data-keepsake-section="summary"
            >
              {section.summary.split(/\n\s*\n/).map((part) => (
                <p key={part.slice(0, 32)} className="tsv-keepsake-summary">
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
              className="tsv-keepsake-page"
              data-keepsake-section="event-summary"
            >
              <p className="tsv-keepsake-summary">{section.label}</p>
            </section>
          );
        }
        if (section.kind === 'stats') {
          return (
            <section
              key={`stats-${index}`}
              className="tsv-keepsake-page"
              data-summary-itinerary="1"
            >
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
              className="tsv-keepsake-page"
              data-keepsake-section="saved-stories"
            >
              <h2>Saved stories</h2>
              <div className="tsv-keepsake-stories">
                {section.stories.map((story) => (
                  <article key={String(story.id)} className="tsv-keepsake-story" data-story-card="1">
                    <h3>{story.title}</h3>
                    {story.story ? <p>{story.story}</p> : null}
                  </article>
                ))}
              </div>
            </section>
          );
        }
        if (section.kind === 'directory') {
          return (
            <section
              key={`dir-${section.tab}`}
              className="tsv-keepsake-page"
              data-directory-bucket={section.label}
              data-summary-itinerary="1"
            >
              <h2>{section.label}</h2>
              <ul className="tsv-keepsake-logo-list">
                {section.items.map((item) => {
                  const place = trip.places?.find((p) => String(p.id) === String(item.id));
                  if (!place) return null;
                  return (
                    <li key={String(item.id)}>
                      <BudgetLogoChip place={place} trip={trip} />
                      <span>{item.title}</span>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        }
        if (section.kind === 'daily-maps') {
          return (
            <section key={`maps-${index}`} className="tsv-keepsake-page" data-keepsake-section="daily-maps">
              <h2>Daily maps</h2>
              {section.maps.map((mapPage) => (
                <div
                  key={mapPage.dayNumber}
                  className="tsv-keepsake-day-map-block"
                  data-day-map-page="1"
                  data-day={String(mapPage.dayNumber)}
                >
                  <h3>{mapPage.dayTitle} map</h3>
                  <DayMap places={mapPage.places} />
                </div>
              ))}
            </section>
          );
        }
        if (section.kind === 'daily-itinerary') {
          return section.days.map((dayPage) => (
            <section
              key={String(dayPage.day.id)}
              className="tsv-keepsake-page tsv-keepsake-day"
              data-print-ready="daily"
              data-day={String(dayPage.day.day_number ?? '')}
            >
              <p className="tsv-keepsake-brand">TimeSyncher · Journey</p>
              <h2>{dayPage.day.title || `Day ${dayPage.day.day_number ?? ''}`}</h2>
              <ol className="tsv-keepsake-day-list">
                {dayPage.timeline.map((entry) => (
                  <li key={entry.id}>
                    <span className="tsv-keepsake-day-time">{timeRangeLabel(entry)}</span>
                    <span>{entry.title}</span>
                  </li>
                ))}
              </ol>
            </section>
          ));
        }
        return null;
      })}

      {model.logoSection ? (
        <section className="tsv-keepsake-page tsv-keepsake-logo-page" data-keepsake-section="logo">
          <p className="tsv-keepsake-brand-logo">TimeSyncher ⌛ Vacation</p>
        </section>
      ) : null}

      <BuildStampFooter />
    </div>
  );
}
