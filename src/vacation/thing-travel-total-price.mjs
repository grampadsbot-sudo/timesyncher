function positive(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function parseMoney(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const s = String(value).trim();
  if (!s) return null;
  const plain = s.match(/^([\d,]+(?:\.\d+)?)$/);
  if (plain) return Number(plain[1].replace(/,/g, ''));
  const direct = Number(s.replace(/[^0-9.]/g, ''));
  if (Number.isFinite(direct) && direct > 0) return direct;
  return null;
}

function dateMs(value) {
  const match = String(value ?? '').match(/^\d{4}-\d{2}-\d{2}/);
  if (!match) return null;
  const stamp = Date.parse(`${match[0]}T00:00:00Z`);
  return Number.isFinite(stamp) ? stamp : null;
}

export function tripNightCount(trip = {}) {
  const start = dateMs(trip.start_date ?? trip.startDate);
  const end = dateMs(trip.end_date ?? trip.endDate);
  if (start == null || end == null || end <= start) return 7;
  return Math.max(1, Math.round((end - start) / 86400000));
}

function hotelNightCount(place = {}, override = {}, trip = {}) {
  const row = { ...place, ...override };
  const stay = positive(row.stayDays);
  if (stay) return Math.round(stay);
  const start = dateMs(row.checkInDate ?? row.check_in_date ?? trip.start_date);
  const end = dateMs(row.checkOutDate ?? row.check_out_date ?? trip.end_date);
  if (start != null && end != null && end > start) {
    return Math.max(1, Math.round((end - start) / 86400000));
  }
  return tripNightCount(trip);
}

function budgetTotalForPlace(shared = {}, placeId) {
  const lines = Array.isArray(shared.budget) ? shared.budget : [];
  const id = String(placeId ?? '');
  if (!id) return null;
  for (const line of lines) {
    if (String(line.place_id ?? '') !== id) continue;
    const amount = positive(line.total_price ?? line.amount ?? line.total);
    if (amount) return Math.round(amount);
  }
  return null;
}

function storedTotalFromFields(place = {}, override = {}) {
  const row = { ...place, ...override };
  const meta = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  return (
    positive(row.stayTotal)
    ?? positive(row.totalPrice)
    ?? positive(row.total_price)
    ?? positive(meta.totalPrice)
    ?? positive(meta.stayTotal)
  );
}

export function thingTravelTotalPrice(place = {}, override = {}, category = '', shared = {}) {
  const cat = String(category || '').toLowerCase();
  const row = { ...place, ...override };
  const id = place?.id;

  if (cat === 'car') {
    const amount = storedTotalFromFields(place, override) ?? parseMoney(row.price ?? place.price);
    if (amount == null) return { amount: 0, label: '', estimated: false, hasPrice: false };
    const body = `$${Math.round(amount).toLocaleString('en-US')}`;
    return { amount: Math.round(amount), label: `${body} total`, estimated: false, hasPrice: true };
  }

  if (cat === 'hotel') {
    if (row.priceIsTotal === true) {
      const amount = parseMoney(row.price ?? place.price);
      if (amount == null) return { amount: 0, label: '', estimated: false, hasPrice: false };
      const body = `$${Math.round(amount).toLocaleString('en-US')}`;
      return { amount: Math.round(amount), label: `${body} total`, estimated: false, hasPrice: true };
    }
    const fromBudget = budgetTotalForPlace(shared, id);
    const fromFields = storedTotalFromFields(place, override);
    const realTotal = fromBudget ?? fromFields;
    if (realTotal != null) {
      const body = `$${Math.round(realTotal).toLocaleString('en-US')}`;
      return {
        amount: Math.round(realTotal),
        label: `${body} total`,
        estimated: false,
        hasPrice: true,
      };
    }
    const rate = parseMoney(row.price ?? place.price);
    if (rate == null) return { amount: 0, label: '', estimated: false, hasPrice: false };
    const nights = hotelNightCount(place, override, shared.trip || shared);
    const amount = Math.round(rate * nights * 1.2);
    const body = `$${amount.toLocaleString('en-US')}`;
    return { amount, label: `${body} est. total`, estimated: true, hasPrice: true };
  }

  return { amount: 0, label: '', estimated: false, hasPrice: false };
}

const BUNDLE_FN = `tsThingTravelTotalAmount=function(G,trip,budgetLines){const d=ha(G)||{},cat=It(G),placeId=G==null?void 0:G.id,money=value=>{if(value==null||value==="")return null;if(typeof value==="number"&&Number.isFinite(value)&&value>0)return value;const s=String(value).trim(),m=s.match(/\\$?\\s*([0-9][0-9,]*(?:\\.\\d+)?)/);return m?Number(m[1].replace(/,/g,"")):null},nights=()=>{const stay=Number(d.stayDays);if(Number.isFinite(stay)&&stay>0)return Math.round(stay);const startRaw=d.checkInDate??d.check_in_date??(trip&&trip.start_date)??"",endRaw=d.checkOutDate??d.check_out_date??(trip&&trip.end_date)??"",start=/^\\d{4}-\\d{2}-\\d{2}/.test(String(startRaw))?Date.parse(String(startRaw).slice(0,10)+"T00:00:00Z"):NaN,end=/^\\d{4}-\\d{2}-\\d{2}/.test(String(endRaw))?Date.parse(String(endRaw).slice(0,10)+"T00:00:00Z"):NaN;if(Number.isFinite(start)&&Number.isFinite(end)&&end>start)return Math.max(1,Math.round((end-start)/86400000));const t0=trip&&/^\\d{4}-\\d{2}-\\d{2}/.test(String(trip.start_date||""))?Date.parse(String(trip.start_date).slice(0,10)+"T00:00:00Z"):NaN,t1=trip&&/^\\d{4}-\\d{2}-\\d{2}/.test(String(trip.end_date||""))?Date.parse(String(trip.end_date).slice(0,10)+"T00:00:00Z"):NaN;return Number.isFinite(t0)&&Number.isFinite(t1)&&t1>t0?Math.max(1,Math.round((t1-t0)/86400000)):7},budgetTotal=()=>{const lines=Array.isArray(budgetLines)?budgetLines:[];for(const line of lines){if(String((line==null?void 0:line.place_id)??"")!==String(placeId??""))continue;const n=money((line==null?void 0:line.total_price)??(line==null?void 0:line.amount)??(line==null?void 0:line.total));if(n!=null)return Math.round(n)}return null},storedStay=money(d.stayTotal??d.totalPrice??d.total_price??(G==null?void 0:G.total_price));if(Mi(G)||cat==="car"){const amount=storedStay??money(bi(G));return amount?{amount:Math.round(amount),estimated:false}:null}if(Zi(G)||cat==="hotel"){if(d.priceIsTotal===true){const amount=money(d.price??(G==null?void 0:G.price));return amount?{amount:Math.round(amount),estimated:false}:null}const budget=budgetTotal();if(budget!=null)return{amount:budget,estimated:false};if(storedStay!=null)return{amount:Math.round(storedStay),estimated:false};const rate=money(bi(G));if(rate==null)return null;return{amount:Math.round(rate*nights()*1.2),estimated:true}}return null},tsThingTravelTotalLabel=function(G,trip,budgetLines){const row=tsThingTravelTotalAmount(G,trip,budgetLines);if(!row)return"";const body="$"+Math.round(row.amount).toLocaleString("en-US");return row.estimated?body+" est. total":body+" total"}`;

export function travelTotalPriceBundleFn() {
  return BUNDLE_FN;
}
