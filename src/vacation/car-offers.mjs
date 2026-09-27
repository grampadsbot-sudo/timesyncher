export const CAR_OFFER_POOL = [
  { brand: 'Alamo', price: 42 },
  { brand: 'Budget', price: 39 },
  { brand: 'Dollar', price: 36 },
  { brand: 'Enterprise', price: 48 },
  { brand: 'Hertz', price: 55 },
  { brand: 'National', price: 51 },
  { brand: 'Thrifty', price: 34 },
  { brand: 'Avis', price: 53 },
  { brand: 'Sixt', price: 61 },
  { brand: 'Payless', price: 33 },
  { brand: 'Fox', price: 37 },
  { brand: 'Ace', price: 44 },
  { brand: 'Europcar', price: 58 },
  { brand: 'Advantage', price: 40 },
];

export function lowestCarOffers(offers, limit = 10) {
  const rows = (Array.isArray(offers) ? offers : [])
    .map((offer) => ({
      brand: String(offer?.brand || '').trim(),
      price: Number(offer?.price),
    }))
    .filter((offer) => offer.brand && Number.isFinite(offer.price));
  rows.sort((left, right) => left.price - right.price || left.brand.localeCompare(right.brand));
  return rows.slice(0, limit);
}

export function withoutCarBrand(offers, brand, limit = 10) {
  const dropped = String(brand || '').trim().toLowerCase();
  const rest = (Array.isArray(offers) ? offers : []).filter((offer) => String(offer?.brand || '').trim().toLowerCase() !== dropped);
  return lowestCarOffers(rest, limit);
}
