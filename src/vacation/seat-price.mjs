import { checkoutAmounts } from './checkout-pricing.mjs';

export function planSeatDollars(env = process.env) {
  const dollars = Math.round(Number(checkoutAmounts(env).orderBump) / 100);
  return Number.isFinite(dollars) && dollars > 0 ? dollars : 27;
}

export function payerSeats(customerTurn) {
  const text = String(customerTurn || '');
  const seats = [];
  const seen = new Set();
  const add = (name, payer) => {
    const who = String(name || '').trim();
    if (!/^[A-Z][a-z]+$/.test(who) || seen.has(who)) return;
    seen.add(who);
    seats.push({ name: who, payer: String(payer || '').trim() });
  };
  const paidByCustomer = text.match(/\bI pay for ([^.?!]+)/i);
  if (paidByCustomer) {
    for (const name of paidByCustomer[1].match(/[A-Z][a-z]+/g) || []) add(name, 'you');
  }
  for (const match of text.matchAll(/\b([A-Z][a-z]+) pays for (himself|herself|themselves)\b/gi)) {
    add(match[1], match[1]);
  }
  for (const match of text.matchAll(/\b([A-Z][a-z]+) pays for ([A-Z][a-z]+)\b/g)) {
    add(match[2], match[1]);
  }
  return seats;
}

export function payerPriceLine(customerTurn, env = process.env) {
  const seats = payerSeats(customerTurn);
  if (!seats.length) return '';
  const dollars = planSeatDollars(env);
  return seats.map((seat) => `${seat.name} $${dollars}, paid by ${seat.payer}`).join('; ');
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

export function priceAnswered(reply, customerTurn, env = process.env) {
  const line = payerPriceLine(customerTurn, env);
  const body = String(reply || '');
  if (!line) return /\$\d+/.test(body);
  return line.split('; ').every((part) => priceClauseSatisfied(part, body));
}
