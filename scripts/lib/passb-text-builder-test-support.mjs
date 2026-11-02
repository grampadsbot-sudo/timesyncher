import { readFileSync } from 'node:fs';

export const recorded = JSON.parse(readFileSync(new URL('../fixtures/live-shared-gate-b-fill-regression.json', import.meta.url)));

const narratives = {
  602: {
    summary: "Zabar's combines smoked fish, bagels and coffee with New York specialty groceries for a food shopping stop.",
    description: "Zabar's is a long-established family food business whose online shop features coffee, smoked fish and gifts. Its menu includes salmon, sable and whitefish with bagels, cream cheese and accompaniments such as tomatoes, onions and capers. Other offerings include pastrami, pickled fish preparations and ready-to-serve rotisserie chicken platters.",
  },
  605: {
    summary: 'Strand Book Store brings together current bestsellers, first editions and collectible books at its longstanding Broadway location.',
    description: 'Strand Book Store sells bestsellers alongside first editions and rare collectibles, drawing on a bookselling history that began in 1927. Its website identifies the business with an extensive book collection. The family bookstore moved to East 12th Street and Broadway in 1957 after earlier operating on Fourth Avenue among the businesses of Book Row.',
  },
  604: {
    summary: 'Statue of Liberty walking tour combines island museums and self-guided audio visits with authorized ferry transportation.',
    description: 'Statue of Liberty walking tour visitors can buy authorized ferry tickets at Castle Clinton in Battery Park or at the New Jersey departure point in Liberty State Park. The visit includes the Statue of Liberty Museum and Ellis Island immigration museum, with self-guided audio tours in multiple languages. Ferry schedules vary with season and tourism demand.',
  },
  606: {
    summary: 'Afternoon matinee show tickets through TKTS offer discounted Broadway and Off Broadway choices for a daytime theatre visit.',
    description: 'Afternoon matinee show planning can include TKTS, which offers discounted tickets for Broadway and Off Broadway musicals, plays and dance productions. The Times Square listing describes same-day matinee and evening tickets as well as next-day matinee availability. Discounts listed range from twenty to fifty percent, while the theatre guide explains that matinee schedules vary by production.',
  },
  607: {
    summary: 'Friend meetup at Bryant Park uses a Midtown gathering place with free daily amenities, classes and space for lunch.',
    description: 'Friend meetup at Bryant Park can draw on the park’s everyday gathering spaces, lunch areas and opportunities for leisurely walks. The park describes free daily amenity areas stocked with equipment and supported by hosts, along with classes and cultural activities. Wireless access also supports outdoor working, while the surrounding Midtown buildings provide an architectural setting for a visit.',
  },
  611: {
    summary: 'Blue Note Jazz Club pairs live jazz with contemporary American food, a full bar and a premium wine list.',
    description: 'Blue Note Jazz Club offers live jazz alongside contemporary American dishes, a full bar and a premium wine list. The saved Tripadvisor page describes both established performers and emerging artists across jazz and related styles. Guest accounts include enthusiasm for the performances as well as complaints about crowding and table placement, giving a mixed picture of the room experience.',
  },
};

export function fixtureBuild(id, dossier, { repaired = true } = {}) {
  const text = narratives[id];
  const claim = (value) => ({ value, claims: [{ text: value, pages: ['p1', 'p2'] }] });
  return {
    payload: {}, structuredText: '',
    findings: {
      summary: claim(repaired ? text.summary : 'A short visit'),
      description: claim(text.description),
    },
  };
}

export function fixtureJudge(_dossier, claims) {
  return claims.map((claim) => ({ id: claim.id, supported: true, reason: 'Offline fixture paraphrase checked against cited saved pages; no live judge claim.' }));
}

export function memoryStore() {
  const rows = new Map();
  return {
    rows,
    getDossier: async (key) => structuredClone(rows.get(key) || null),
    putDossier: async (key, value) => { rows.set(key, structuredClone(value)); },
  };
}
