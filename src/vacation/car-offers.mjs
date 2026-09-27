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

export function withoutCarBrand(offers, brand) {
  const dropped = String(brand || '').trim().toLowerCase();
  return lowestCarOffers(offers, offers?.length || 10).filter((offer) => offer.brand.toLowerCase() !== dropped);
}
