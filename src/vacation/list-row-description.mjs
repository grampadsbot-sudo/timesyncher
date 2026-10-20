function text(value, max = 2000) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function formatMoney(value) {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'number' && Number.isFinite(value)) return `$${value}`;
  const raw = text(value, 80);
  if (!raw) return '';
  if (/^\$/.test(raw)) return raw;
  if (/[\d]/.test(raw)) return `$${raw.replace(/^\$/, '')}`;
  return '';
}

function reputationFromThemes(themes) {
  if (!Array.isArray(themes)) return '';
  return themes.map((row) => text(row, 200)).filter(Boolean).join('; ');
}

function hotelReputation(row = {}) {
  const bits = [];
  if (text(row.googleRating)) {
    bits.push(`Google ${row.googleRating}${text(row.googleReviewCount) ? ` (${row.googleReviewCount})` : ''}`);
  }
  if (text(row.yelpRating)) {
    bits.push(`Yelp ${row.yelpRating}${text(row.yelpReviewCount) ? ` (${row.yelpReviewCount})` : ''}`);
  }
  if (text(row.thirdPartyRating)) {
    const label = text(row.thirdPartySource, 40) || 'Rating';
    bits.push(`${label} ${row.thirdPartyRating}${text(row.thirdPartyReviewCount) ? ` (${row.thirdPartyReviewCount})` : ''}`);
  }
  return bits.join('; ');
}

export function composeListRowDescription({ category = '', summary = '', fields = {} } = {}) {
  const cat = text(category, 40).toLowerCase();
  const hook = text(summary, 500);
  const parts = [];
  const push = (label, value) => {
    const row = text(value, 500);
    if (row) parts.push(label ? `${label}: ${row}` : row);
  };

  if (cat === 'car') {
    if (hook) parts.push(hook);
    push('Class', fields.carType || fields.vehicleClass);
    push('Pickup', fields.pickupLocation);
    push('Pickup hours', fields.pickupHours);
    push('Drop-off', fields.returnLocation);
    push('Drop-off hours', fields.dropoffHours);
    const price = formatMoney(fields.price);
    if (price) push('Price', `${price} total`);
    push('Reputation', text(fields.reputationNote, 500) || reputationFromThemes(fields.reviewThemes));
    return parts.join(' · ') || hook;
  }

  if (cat === 'hotel') {
    if (hook) parts.push(hook);
    push('Check-in', fields.checkInTime);
    push('Check-out', fields.checkOutTime);
    push('Area', fields.neighborhood);
    push('Location', fields.address);
    push('Note', fields.hotelNote);
    const price = formatMoney(fields.price);
    if (price) push('Price', `${price}/night`);
    push('Reputation', hotelReputation(fields) || fields.hotelNote);
    return parts.join(' · ') || hook;
  }

  return hook;
}

export function listRowDescriptionBundleSnippet() {
  return [
    'tsListRowDescription=function(G){',
    'const ov=ha(G)||{},meta=(G&&G.metadata&&typeof G.metadata==="object")?G.metadata:{},sr=(ov.sourceRecord&&typeof ov.sourceRecord==="object")?ov.sourceRecord:(G&&G.sourceRecord&&typeof G.sourceRecord==="object")?G.sourceRecord:(meta.sourceRecord&&typeof meta.sourceRecord==="object")?meta.sourceRecord:{},row={...sr,...ov};',
    'if(!row.address&&G&&G.address)row.address=G.address;if(row.price==null&&G&&G.price!=null)row.price=G.price;',
    'const cat=String(It(G)||"").toLowerCase(),hook=String(row.summary||row.itineraryNote||row.itinerary_note||"").replace(/\\s+/g," ").trim();',
    'const parts=[],push=(label,val)=>{const s=String(val||"").replace(/\\s+/g," ").trim();if(s)parts.push(label?label+": "+s:s);};',
    'const money=v=>{if(v==null||v==="")return"";if(typeof v==="number"&&isFinite(v))return"$"+v;',
    'const raw=String(v).replace(/\\s+/g," ").trim();if(!raw)return"";return/^\\$/.test(raw)?raw:/[\\d]/.test(raw)?"$"+raw.replace(/^\\$/,""):"";};',
    'if(cat==="car"){if(hook)parts.push(hook);',
    'push("Class",row.carType||row.vehicleClass);',
    'push("Pickup",row.pickupLocation||row.pickup_location);push("Pickup hours",row.pickupHours||row.pickup_hours);',
    'push("Drop-off",row.returnLocation||row.return_location||row.dropoffLocation);push("Drop-off hours",row.dropoffHours||row.dropoff_hours||row.returnHours);',
    'const carPrice=money(row.price??bi(G));if(carPrice)push("Price",carPrice+" total");',
    'const themes=Array.isArray(row.reviewThemes)?row.reviewThemes.map(t=>String(t||"").trim()).filter(Boolean).join("; "):"";',
    'push("Reputation",row.reputationNote||themes);',
    'return parts.join(" · ")||hook;}',
    'if(cat==="hotel"){if(hook)parts.push(hook);',
    'push("Check-in",row.checkInTime||row.check_in_time);push("Check-out",row.checkOutTime||row.check_out_time);',
    'push("Area",row.neighborhood);push("Location",row.address);push("Note",row.hotelNote||row.hotel_note);',
    'const hotelPrice=money(row.price??bi(G));if(hotelPrice)push("Price",hotelPrice+"/night");',
    'const rep=[row.googleRating?"Google "+row.googleRating+(row.googleReviewCount?" ("+row.googleReviewCount+")":""):"",',
    'row.yelpRating?"Yelp "+row.yelpRating+(row.yelpReviewCount?" ("+row.yelpReviewCount+")":""):"",',
    'row.thirdPartyRating?(row.thirdPartySource||"Rating")+" "+row.thirdPartyRating+(row.thirdPartyReviewCount?" ("+row.thirdPartyReviewCount+")":""):""].filter(Boolean).join("; ");',
    'push("Reputation",rep||row.hotelNote);',
    'return parts.join(" · ")||hook;}',
    'return hook;},',
  ].join('');
}
