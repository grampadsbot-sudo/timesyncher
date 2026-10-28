import { createHash } from 'node:crypto';

function verifiedPage(url, text) {
  return {
    url,
    text,
    sha256: createHash('sha256').update(text).digest('hex'),
    fetchedAt: '2026-01-01T00:00:00.000Z',
  };
}

function presentedDossier(name) {
  const summary = `${name} is a downtown restaurant known for seasonal plates and attentive wine service.`;
  const description = [
    `${name} serves seasonal plates, natural wine, and attentive service in a cozy downtown dining room with candlelit tables.`,
    'Guests come for the chef-driven menu, warm hospitality, reliable reservations on busy weekends, thoughtful wine pairings,',
    'and a dessert menu that changes with the seasons.',
  ].join(' ');
  const pageText = `${description} ${description}`;
  const claim = { text: name, pages: ['p1'], supported: true };
  return {
    thing: name,
    pages: [verifiedPage(`https://${name.toLowerCase().replace(/\s+/g, '')}.example/`, pageText)],
    attempts: [{ kind: 'builder', status: 'ok', at: '2026-01-01T00:00:00.000Z' }],
    fields: {
      summary: { value: summary, claims: [claim] },
      description: { value: description, claims: [claim] },
    },
  };
}

function absentDossier() {
  return { thing: 'Missing', pages: [], attempts: [] };
}

export function buildPassbScorecardGoodFixture() {
  const rows = [
    { id: 7001, name: 'Fixture One', cat: 'restaurant' },
    { id: 7002, name: 'Fixture Two', cat: 'restaurant' },
    { id: 7003, name: 'Fixture Three', cat: 'restaurant' },
    { id: 7004, name: 'Fixture Four', cat: 'restaurant' },
    { id: 7005, name: 'Fixture Five', cat: 'restaurant' },
  ];
  const dossiersByPlaceId = {};
  for (const row of rows) {
    dossiersByPlaceId[row.id] = presentedDossier(row.name);
  }
  return { rows, dossiersByPlaceId, placesById: {} };
}

export function buildPassbScorecardUnderBarFixture() {
  const rows = [
    { id: 7101, name: 'Fixture One', cat: 'restaurant' },
    { id: 7102, name: 'Fixture Two', cat: 'restaurant' },
    { id: 7103, name: 'Fixture Three', cat: 'restaurant' },
    { id: 7104, name: 'Fixture Four', cat: 'restaurant' },
    { id: 7105, name: 'Fixture Five', cat: 'restaurant' },
  ];
  const dossiersByPlaceId = {
    7101: presentedDossier('Fixture One'),
    7102: presentedDossier('Fixture Two'),
    7103: absentDossier(),
    7104: absentDossier(),
    7105: absentDossier(),
  };
  return { rows, dossiersByPlaceId, placesById: {} };
}
