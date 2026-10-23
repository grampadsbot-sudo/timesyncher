import {
  appendNycStagingListTabRows,
  resolveNycCcabKey,
} from './nyc-vk-list-tab-rows.mjs';

const NYC_CONFLICT_DAY = 3;

export { resolveNycCcabKey };

export function buildNycCraigKimDaybydayTimelineRows() {
  return [
    {
      day: 1,
      time: '12:37',
      name: 'American Airlines LAS → JFK',
      cat: 'flight',
      id: 601,
      ccabKey: 'Flight option: American LAS-JFK 2026-06-23 12:37-20:59',
    },
    { day: 1, time: '14:00', name: "Zabar's", cat: 'store', id: 602, photo: true, ccabKey: "Zabar's" },
    {
      day: 1,
      time: '16:00',
      name: 'Hotel Belleclaire Central Park',
      cat: 'hotel',
      id: 603,
      ccabKey: 'Hotel Belleclaire Central Park',
    },
    { day: 1, time: '19:00', name: 'Carbone', cat: 'restaurant', id: 610, ccabKey: 'Carbone' },
    {
      day: 1,
      time: '20:30',
      name: 'Blue Note Jazz Club',
      cat: 'activity',
      id: 611,
      ccabKey: 'Jazz at Lincoln Center',
    },
    {
      day: 2,
      time: '11:00',
      name: 'Statue of Liberty walking tour',
      cat: 'activity',
      id: 604,
      photo: true,
      video: true,
      ccabKey: 'Statue of Liberty walking tour',
    },
    { day: 2, time: '15:30', name: 'Strand Book Store', cat: 'store', id: 605, ccabKey: 'Strand Book Store' },
    {
      day: NYC_CONFLICT_DAY,
      time: '14:00',
      name: 'Afternoon matinee show',
      cat: 'activity',
      id: 606,
      ccabKey: 'Afternoon matinee show',
    },
    {
      day: NYC_CONFLICT_DAY,
      time: '14:30',
      name: 'Friend meetup at Bryant Park',
      cat: 'activity',
      id: 607,
      ccabKey: 'Friend meetup at Bryant Park',
    },
    {
      day: 4,
      time: '12:30',
      name: 'Chelsea Market',
      cat: 'store',
      id: 612,
      ccabKey: 'Chelsea Market',
    },
    {
      day: 5,
      time: '11:00',
      name: "Macy's Herald Square",
      cat: 'store',
      id: 613,
      ccabKey: "Macy's Herald Square",
    },
    {
      day: 6,
      time: '14:00',
      name: 'MoMA Design Store - 53rd Street',
      cat: 'store',
      id: 614,
      ccabKey: 'MoMA Design Store - 53rd Street',
    },
    {
      day: 7,
      time: '11:00',
      name: 'Bergdorf Goodman',
      cat: 'store',
      id: 615,
      ccabKey: 'Bergdorf Goodman',
    },
    {
      day: 8,
      time: '10:00',
      name: 'Whole Foods Market Columbus Circle',
      cat: 'store',
      id: 616,
      ccabKey: 'Whole Foods Market Columbus Circle',
    },
    {
      day: 8,
      time: '18:00',
      name: 'American Airlines JFK → LAS',
      cat: 'flight',
      id: 635,
      ccabKey: 'Flight option: American LAS-JFK 2026-06-23 12:37-20:59',
    },
    {
      day: 1,
      time: '11:00',
      name: 'The Manhattan Club',
      cat: 'hotel',
      id: 608,
      listOnly: true,
      ccabKey: 'The Manhattan Club',
    },
    {
      day: 1,
      time: '11:00',
      name: 'Priceline opaque Standard sedan',
      cat: 'car',
      id: 609,
      listOnly: true,
      ccabKey: 'Priceline opaque JFK — Standard sedan',
    },
    {
      day: 1,
      time: '07:25',
      name: 'Southwest LAS → LGA 07:25–16:35',
      cat: 'flight',
      id: 630,
      listOnly: true,
      ccabKey: 'Flight option: Southwest LAS-LGA 2026-06-23 07:25-16:35',
    },
    {
      day: 1,
      time: '11:30',
      name: 'Southwest LAS → LGA 11:30–22:25',
      cat: 'flight',
      id: 631,
      listOnly: true,
      ccabKey: 'Flight option: Southwest LAS-LGA 2026-06-23 11:30-22:25',
    },
    {
      day: 1,
      time: '05:05',
      name: 'Southwest LAS → LGA 05:05–15:45',
      cat: 'flight',
      id: 632,
      listOnly: true,
      ccabKey: 'Flight option: Southwest LAS-LGA 2026-06-23 05:05-15:45',
    },
    {
      day: 1,
      time: '06:30',
      name: 'Southwest LAS → LGA 06:30–16:55',
      cat: 'flight',
      id: 633,
      listOnly: true,
      ccabKey: 'Flight option: Southwest LAS-LGA 2026-06-23 06:30-16:55',
    },
    {
      day: 1,
      time: '06:50',
      name: 'Southwest LAS → LGA 06:50–18:55',
      cat: 'flight',
      id: 634,
      listOnly: true,
      ccabKey: 'Flight option: Southwest LAS-LGA 2026-06-23 06:50-18:55',
    },
  ];
}

export function buildNycCraigKimDaybydayFixtureRows() {
  const rows = buildNycCraigKimDaybydayTimelineRows();
  appendNycStagingListTabRows(rows);
  return rows;
}
