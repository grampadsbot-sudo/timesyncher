import { intakeWriteRejected } from './intake-thing-admission.mjs';

const CHAT_EXTRACTION = 'chat_extraction';

function clean(value, max = 6000) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

export function cleanExtractedThingsWithProvenance(list, { customerTurnId = '', provenanceContext = {} } = {}) {
  const things = [];
  const seen = new Set();
  for (const item of list) {
    const name = clean(item?.name || item?.title, 180);
    if (!name) continue;
    const span = clean(item?.customerSpan, 240) || name;
    const activeTurnId = clean(customerTurnId, 120) || 'current';
    const origin = clean(item?.origin, 80).toLowerCase() || 'customer_turn';
    const meta = {
      origin,
      customerTurnId: clean(item?.customerTurnId, 120) || activeTurnId,
      customerSpan: span,
      existingThingId: clean(item?.existingThingId, 120),
    };
    if (intakeWriteRejected(name, meta, provenanceContext)) continue;
    const key = `${meta.customerTurnId}:${span.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    things.push({
      name,
      kind: clean(item?.kind || item?.category, 40).toLowerCase(),
      who: clean(item?.who, 120),
      when: clean(item?.when || item?.whenLabel, 180),
      source: CHAT_EXTRACTION,
      origin: meta.origin,
      customerTurnId: meta.customerTurnId,
      customerSpan: meta.customerSpan,
      existingThingId: meta.existingThingId,
    });
  }
  return things;
}

function formatCustomerTurnsForExtraction(customerTurns = []) {
  return (Array.isArray(customerTurns) ? customerTurns : [])
    .map((turn) => {
      const id = clean(turn?.id || turn?.turnId, 120);
      const text = clean(turn?.storedText || turn?.text || turn, 6000);
      if (!id || !text) return '';
      return `[customer turn ${id}]\n${text}`;
    })
    .filter(Boolean)
    .join('\n\n');
}

export function provenanceContextFromTurns({ customerTurns = [], customerTurnId = '', message = '', tripBlurb = '' } = {}) {
  const activeTurnId = clean(customerTurnId, 120) || 'current';
  const turns = customerTurns.length
    ? customerTurns
    : [{ id: activeTurnId, text: message, speaker: 'customer' }];
  return {
    customerTurns: Object.fromEntries(
      turns
        .filter((turn) => clean(turn?.id || turn?.turnId, 120))
        .map((turn) => [clean(turn.id || turn.turnId, 120), turn]),
    ),
    tripBlurb,
  };
}

export function extractionUserContent({ customerTurns = [], message = '', tripBlurb = '', existingThings = [] } = {}) {
  const customerSources = formatCustomerTurnsForExtraction(customerTurns) || clean(message, 6000);
  const contextLines = [];
  if (tripBlurb) contextLines.push(`[customer blurb]\n${clean(tripBlurb, 6000)}`);
  if (existingThings.length) {
    contextLines.push(`[existing things]\n${existingThings.map((row) => `${row.id}\t${row.title}\t${row.category}\t${row.origin || ''}`).join('\n')}`);
  }
  return [contextLines.join('\n\n'), customerSources].filter(Boolean).join('\n\n');
}