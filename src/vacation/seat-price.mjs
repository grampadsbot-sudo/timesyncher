import { CheckoutConfigError, requiredConfigCents } from './checkout-pricing.mjs';

export function planSeatDollars(env = process.env) {
  const cents = requiredConfigCents(env?.TIMESYNCHER_ORDER_BUMP_PRICE_CENTS, 'TIMESYNCHER_ORDER_BUMP_PRICE_CENTS');
  const dollars = Math.round(cents / 100);
  if (dollars <= 0) throw new CheckoutConfigError('TIMESYNCHER_ORDER_BUMP_PRICE_CENTS');
  return dollars;
}

export function configuredSeatDollars(env) {
  try {
    return planSeatDollars(env);
  } catch (error) {
    if (error?.name !== 'CheckoutConfigError') throw error;
    console.error(`seat price is not configured: ${error.message}`);
    return null;
  }
}

function extractedPayerRows(seats) {
  if (!Array.isArray(seats)) return [];
  const rows = [];
  const seen = new Set();
  for (const item of seats) {
    const name = String(item?.name || '').trim();
    const payer = String(item?.payer || '').trim();
    if (!name || !payer || seen.has(name)) continue;
    seen.add(name);
    rows.push({ name, payer });
  }
  return rows;
}

export function payerLineFromDollars(_customerTurn, dollars, extracted = null) {
  const amount = Number(dollars);
  if (!Number.isFinite(amount) || amount <= 0) return '';
  const seats = extractedPayerRows(extracted);
  if (!seats.length) return '';
  return seats.map((seat) => `${seat.name} $${amount}, paid by ${seat.payer}`).join('; ');
}

export function payerPriceLine(seats, env = process.env) {
  const list = extractedPayerRows(seats);
  if (!list.length) return '';
  let dollars = null;
  try {
    dollars = planSeatDollars(env);
  } catch (error) {
    if (error?.name !== 'CheckoutConfigError') throw error;
  }
  if (!dollars) return '';
  return list.map((seat) => `${seat.name} $${dollars}, paid by ${seat.payer}`).join('; ');
}

export function priceClauseSatisfied(part, reply) {
  const body = String(reply || '');
  const clause = String(part || '').trim();
  if (!clause) return false;
  if (body.includes(clause)) return true;
  const match = clause.match(/^(.*?) \$(\d+), paid by (.+)$/);
  if (!match) return false;
  const name = match[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const payer = match[3].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const selfPay = match[1].toLowerCase() === match[3].toLowerCase();
  const payerPattern = selfPay ? `(?:${payer}|him|her)` : payer;
  if (new RegExp(`${name}(?:['’]s)?(?:\\s+(?!\\$)[\\w'’]+){0,8}\\s+\\$${match[2]}, paid by ${payerPattern}`, 'i').test(body)) return true;
  const namedAmount = new RegExp(`${name}['’]s\\s+\\$${match[2]}`, 'i');
  if (match[3].toLowerCase() === 'you' && namedAmount.test(body)) {
    return new RegExp(`you(?:['’]ll| will)?\\s+(?:cover|pay)\\s+${name}['’]s\\s+\\$${match[2]}`, 'i').test(body);
  }
  if (selfPay) {
    return new RegExp(`${name}\\s+will\\s+pay\\s+(?:his|her|their)\\s+own\\s+\\$${match[2]}|${name}\\s+(?:covers|pays)\\s+(?:his|her|their)\\s+own\\s+\\$${match[2]}`, 'i').test(body);
  }
  return false;
}

export function priceAnswered(reply, seats, env = process.env) {
  const list = extractedPayerRows(seats);
  const line = payerPriceLine(list, env);
  const body = String(reply || '');
  if (list.length && !line) return false;
  if (!line) return /\$\d+/.test(body);
  return line.split('; ').every((part) => priceClauseSatisfied(part, body));
}
