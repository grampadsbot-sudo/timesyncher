function text(value, max = 2000) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function formatMoney(value) {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'number' && Number.isFinite(value)) {
    const row = `$${value}`;
    return /[\d]/.test(row) ? row : '';
  }
  const raw = text(value, 80);
  if (!raw) return '';
  let row = '';
  if (/^\$/.test(raw)) row = raw;
  else if (/[\d]/.test(raw)) row = `$${raw.replace(/^\$/, '')}`;
  return row && /[\d]/.test(row) ? row : '';
}

function hasPriceDigits(value) {
  return /[\d]/.test(String(value || ''));
}

function reputationFromThemes(themes) {
  if (!Array.isArray(themes)) return '';
  return themes.map((row) => text(row, 200)).filter(Boolean).join('; ');
}

const EXPERIENCE_CATEGORIES = new Set([
  'activity',
  'event',
  'attraction',
  'music',
  'tour',
  'sightseeing',
  'theatre',
  'tickets',
  'family_event',
  'other',
]);

function isExperienceCategory(category = '') {
  return EXPERIENCE_CATEGORIES.has(text(category, 40).toLowerCase());
}

function wordCount(value = '') {
  return text(value, 4000).split(/\s+/).filter(Boolean).length;
}

function isGenericListDescription(value = '') {
  const row = text(value, 4000);
  if (!row) return true;
  if (/^Documented NYC option\b/i.test(row)) return true;
  if (/^Documented .+ option\b/i.test(row)) return true;
  if (wordCount(row) < 6) return true;
  return false;
}

function isPipelineDiagnostic(value = '') {
  const row = text(value, 4000);
  if (!row) return false;
  if (/\bBlocked:/i.test(row)) return true;
  if (/\bprovenanceBlocker\b/i.test(row)) return true;
  if (/\bccab capture\b/i.test(row)) return true;
  if (/\blist-only\b/i.test(row) && /\b(?:hotel|row|property)\b/i.test(row)) return true;
  if (/^List-only row until/i.test(row)) return true;
  return false;
}

function isTimingShell(value = '') {
  const row = text(value, 4000);
  if (!row) return false;
  if (wordCount(row) >= 12) return false;
  const stripped = row
    .replace(/\b(?:Start|Duration|Price estimate):[^·;]+/gi, '')
    .replace(/[·;]/g, ' ')
    .trim();
  return wordCount(stripped) < 4;
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

export function composeListRowDescription({ category = '', summary = '', fields = {}, omitListPrice = false } = {}) {
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
    push('Pickup time', fields.pickupTime || fields.startTime);
    push('Drop-off', fields.returnLocation);
    push('Drop-off hours', fields.dropoffHours);
    push('Drop-off time', fields.dropoffTime || fields.returnTime || fields.endTime);
    const carDetail = text(fields.longDetails || fields.details || fields.description, 4000);
    if (carDetail && !isGenericListDescription(carDetail) && !parts.join(' · ').includes(carDetail)) {
      parts.push(carDetail);
    }
    const price = formatMoney(fields.price);
    if (!omitListPrice && hasPriceDigits(price)) push('', `${price} total`);
    push('Reputation', text(fields.reputationNote, 500) || reputationFromThemes(fields.reviewThemes));
    return parts.join(' · ') || hook;
  }

  if (cat === 'hotel') {
    if (fields.placeId === 608) {
      if (hook) parts.push(hook);
      push('Area', fields.neighborhood);
      push('Location', fields.address);
      return parts.join(' · ') || hook;
    }
    if (hook) parts.push(hook);
    push('Check-in', fields.checkInTime);
    push('Check-out', fields.checkOutTime);
    push('Area', fields.neighborhood);
    push('Location', fields.address);
    const hotelDetail = text(fields.longDetails || fields.details || fields.description, 4000);
    if (hotelDetail && !isGenericListDescription(hotelDetail) && !parts.join(' · ').includes(hotelDetail)) {
      parts.push(hotelDetail);
    }
    push('', fields.websiteFlavour);
    push('Amenities', Array.isArray(fields.amenities) ? fields.amenities.join(', ') : fields.amenities);
    push('Price level', fields.priceLevel);
    push('Note', fields.hotelNote);
    const price = formatMoney(fields.price);
    if (!omitListPrice && hasPriceDigits(price)) push('', `${price}/night`);
    const note = text(fields.hotelNote, 500);
    const reputation = hotelReputation(fields) || (note && note !== hook ? note : '');
    push('Reputation', reputation);
    push('Common praise', reputationFromThemes(fields.reviewThemes?.praise));
    push('Common complaints', reputationFromThemes(fields.reviewThemes?.complaints));
    return parts.join(' · ') || hook;
  }

  if (isExperienceCategory(cat) || cat === 'restaurant' || cat === 'store' || cat === 'flight') {
    const note = text(fields.itineraryNote || fields.itinerary_note, 280);
    if (hook) parts.push(hook);
    if (note && !parts.includes(note)) parts.push(note);
    if (isExperienceCategory(cat)) {
      push('Start', fields.startTime || fields.place_time || fields.start_time);
      push('Duration', fields.duration);
    }
    const joined = () => parts.join(' · ');
    const what = text(fields.longDetails || fields.details || fields.description, 4000);
    if (
      what
      && !isPipelineDiagnostic(what)
      && !isGenericListDescription(what)
      && !joined().includes(what)
    ) {
      parts.push(what);
    }
    const flavour = text(fields.websiteFlavour, 2000);
    if (flavour && !joined().includes(flavour)) parts.push(flavour);
    push('Where', fields.address || fields.location);
    const price = formatMoney(fields.price);
    if (!omitListPrice && hasPriceDigits(price)) push('Price estimate', price);
    const praise = reputationFromThemes(
      fields.reviewThemes && typeof fields.reviewThemes === 'object' && !Array.isArray(fields.reviewThemes)
        ? fields.reviewThemes.praise
        : fields.reviewThemes,
    );
    const rating = fields.thirdPartyRating
      ? `${text(fields.thirdPartySource, 40) || 'Rating'} ${fields.thirdPartyRating}${text(fields.thirdPartyReviewCount) ? ` (${fields.thirdPartyReviewCount})` : ''}`
      : '';
    push('Why go', text(fields.worthNote, 500) || praise || rating);
    const experienceRow = parts.join(' · ') || hook || note;
    if (
      (wordCount(experienceRow) < 6 || isGenericListDescription(experienceRow))
      && what
      && !isPipelineDiagnostic(what)
      && !isGenericListDescription(what)
    ) {
      return what;
    }
    return isGenericListDescription(experienceRow) ? '' : experienceRow;
  }

  return hook;
}

export function finalizeListRowDisplayDescription(composed = '', { spare = '' } = {}) {
  let row = text(composed, 4000);
  const fallback = text(spare, 4000);
  if (
    (
      wordCount(row) < 6
      || isGenericListDescription(row)
      || isTimingShell(row)
      || isPipelineDiagnostic(row)
    )
    && fallback
  ) {
    if (!isPipelineDiagnostic(fallback) && !isGenericListDescription(fallback)) {
      row = fallback;
    }
  }
  if (isPipelineDiagnostic(row) || isTimingShell(row) || isGenericListDescription(row)) return '';
  return row;
}

export function listRowDescriptionBundleSnippet() {
  return [
    'tsListRowDescription=function(G){',
    'const ov=ha(G)||{},meta=(G&&G.metadata&&typeof G.metadata==="object")?G.metadata:{},sr=(ov.sourceRecord&&typeof ov.sourceRecord==="object")?ov.sourceRecord:(G&&G.sourceRecord&&typeof G.sourceRecord==="object")?G.sourceRecord:(meta.sourceRecord&&typeof meta.sourceRecord==="object")?meta.sourceRecord:{},row={...sr,...ov};',
    'const blocked=Array.isArray(ov.provenanceBlocked)?ov.provenanceBlocked:(Array.isArray(row.provenanceBlocked)?row.provenanceBlocked:[]);',
    'if(blocked.includes("price")){delete row.price;delete row.totalPrice;delete row.total_price;}',
    'if(!row.address&&G&&G.address)row.address=G.address;if(row.price==null&&G&&G.price!=null&&!blocked.includes("price"))row.price=G.price;',
    'const wc=v=>String(v||"").replace(/\\s+/g," ").trim().split(/\\s+/).filter(Boolean).length;',
    'const isDiag=v=>{const s=String(v||"").replace(/\\s+/g," ").trim();return!s?false:/\\bBlocked:/i.test(s)||/\\bccab capture\\b/i.test(s)||/^List-only row until/i.test(s);};',
    'const isGeneric=v=>{const s=String(v||"").replace(/\\s+/g," ").trim();if(!s)return true;if(/^Documented NYC option\\b/i.test(s))return true;if(/^Documented .+ option\\b/i.test(s))return true;return wc(s)<6;};',
    'const isShell=v=>{const s=String(v||"").replace(/\\s+/g," ").trim();if(!s||wc(s)>=12)return false;const stripped=s.replace(/\\b(?:Start|Duration|Price estimate):[^·;]+/gi,"").replace(/[·;]/g," ").trim();return wc(stripped)<4;};',
    'const spare=String(row.longDetails||row.details||row.description||(G&&G.description)||"").replace(/\\s+/g," ").trim();',
    'const finalizeRow=out=>{let row=String(out||"").replace(/\\s+/g," ").trim();if((wc(row)<6||isShell(row)||isDiag(row)||isGeneric(row))&&spare&&!isDiag(spare)&&!isGeneric(spare))row=spare;if(isDiag(row)||isShell(row)||isGeneric(row))return"";return row;};',
    'let hook=String(row.summary||row.itineraryNote||row.itinerary_note||"").replace(/\\s+/g," ").trim();if(isDiag(hook))hook="";',
    'const cat=String(It(G)||"").toLowerCase();',
    'const parts=[],push=(label,val)=>{const s=String(val||"").replace(/\\s+/g," ").trim();if(s)parts.push(label?label+": "+s:s);};',
    'const money=v=>{if(v==null||v==="")return"";let out="";if(typeof v==="number"&&isFinite(v))out="$"+v;else{const raw=String(v).replace(/\\s+/g," ").trim();if(!raw)return"";out=/^\\$/.test(raw)?raw:/[\\d]/.test(raw)?"$"+raw.replace(/^\\$/,""):"";}',
    'return out&&/[\\d]/.test(out)?out:"";};',
    'const hasPriceDigits=v=>/[\\d]/.test(String(v||""));',
    'if(cat==="car"){if(hook)parts.push(hook);',
    'push("Class",row.carType||row.vehicleClass);',
    'push("Pickup",row.pickupLocation||row.pickup_location);push("Pickup hours",row.pickupHours||row.pickup_hours);',
    'push("Pickup time",row.pickupTime||row.startTime);',
    'push("Drop-off",row.returnLocation||row.return_location||row.dropoffLocation);push("Drop-off hours",row.dropoffHours||row.dropoff_hours||row.returnHours);',
    'push("Drop-off time",row.dropoffTime||row.returnTime||row.endTime);',
    'const carDetail=String(row.longDetails||row.details||row.description||"").replace(/\\s+/g," ").trim();',
    'if(carDetail&&!parts.join(" · ").includes(carDetail))parts.push(carDetail);',
    'const carPrice=money(row.price??(blocked.includes("price")?"":bi(G)));if(hasPriceDigits(carPrice))push("",carPrice+" total");',
    'const themes=Array.isArray(row.reviewThemes)?row.reviewThemes.map(t=>String(t||"").trim()).filter(Boolean).join("; "):"";',
    'push("Reputation",row.reputationNote||themes);',
    'return finalizeRow(parts.join(" · ")||hook);}',
    'if(cat==="hotel"){if(G&&Number(G.id)===608){if(hook)parts.push(hook);push("Area",row.neighborhood);push("Location",row.address);return finalizeRow(parts.join(" · ")||hook);}if(hook)parts.push(hook);',
    'push("Check-in",row.checkInTime||row.check_in_time);push("Check-out",row.checkOutTime||row.check_out_time);',
    'push("Area",row.neighborhood);push("Location",row.address);',
    'const hotelDetail=String(row.longDetails||row.details||row.description||"").replace(/\\s+/g," ").trim();',
    'if(hotelDetail&&!isDiag(hotelDetail)&&!parts.join(" · ").includes(hotelDetail))parts.push(hotelDetail);',
    'push("Note",row.hotelNote||row.hotel_note);',
    'push("",row.websiteFlavour);push("Amenities",Array.isArray(row.amenities)?row.amenities.join(", "):row.amenities);push("Price level",row.priceLevel);',
    'const hotelPrice=money(row.price??(blocked.includes("price")?"":bi(G)));if(hasPriceDigits(hotelPrice))push("",hotelPrice+"/night");',
    'const rep=[row.googleRating?"Google "+row.googleRating+(row.googleReviewCount?" ("+row.googleReviewCount+")":""):"",',
    'row.yelpRating?"Yelp "+row.yelpRating+(row.yelpReviewCount?" ("+row.yelpReviewCount+")":""):"",',
    'row.thirdPartyRating?(row.thirdPartySource||"Rating")+" "+row.thirdPartyRating+(row.thirdPartyReviewCount?" ("+row.thirdPartyReviewCount+")":""):""].filter(Boolean).join("; ");',
    'const note=String(row.hotelNote||row.hotel_note||"").replace(/\\s+/g," ").trim();push("Reputation",rep||(note&&note!==hook?note:""));',
    'if(row.reviewThemes&&typeof row.reviewThemes==="object"){for(const [key,label] of [["praise","Common praise"],["complaints","Common complaints"]]){const themes=row.reviewThemes[key];if(Array.isArray(themes))push(label,themes.map(t=>String(t||"").trim()).filter(Boolean).join("; "));}}',
    'return finalizeRow(parts.join(" · ")||hook);}',
    'const experience=new Set(["activity","event","attraction","music","tour","sightseeing","theatre","tickets","family_event","other"]);',
    'if(experience.has(cat)||cat==="restaurant"||cat==="store"||cat==="flight"){const note=String(row.itineraryNote||row.itinerary_note||"").replace(/\\s+/g," ").trim();',
    'if(hook)parts.push(hook);if(note&&!parts.includes(note))parts.push(note);',
    'const when=String(row.startTime||row.start_time||(G&&G.place_time?G.place_time:"")||"").replace(/\\s+/g," ").trim();',
    'if(experience.has(cat)){push("Start",when);push("Duration",row.duration);}',
    'const joined=()=>parts.join(" · ");',
    'const what=String(row.longDetails||row.details||row.description||"").replace(/\\s+/g," ").trim();',
    'if(what&&!isDiag(what)&&!isGeneric(what)&&!joined().includes(what))parts.push(what);',
    'const flavour=String(row.websiteFlavour||"").replace(/\\s+/g," ").trim();',
    'if(flavour&&!joined().includes(flavour))parts.push(flavour);',
    'push("Where",row.address||row.location);',
    'const expPrice=money(row.price??(blocked.includes("price")?"":bi(G)));if(hasPriceDigits(expPrice))push("Price estimate",expPrice);',
    'const expRep=row.thirdPartyRating?(row.thirdPartySource||"Rating")+" "+row.thirdPartyRating+(row.thirdPartyReviewCount?" ("+row.thirdPartyReviewCount+")":""):"";',
    'let praise="";if(row.reviewThemes&&typeof row.reviewThemes==="object"&&Array.isArray(row.reviewThemes.praise))praise=row.reviewThemes.praise.map(t=>String(t||"").trim()).filter(Boolean).join("; ");',
    'push("Why go",row.worthNote||praise||expRep);',
    'let expRow=parts.join(" · ")||hook||note;if((wc(expRow)<6||isShell(expRow)||isGeneric(expRow))&&what&&!isDiag(what)&&!isGeneric(what))expRow=what;if(isGeneric(expRow))return"";',
    'return finalizeRow(expRow);}',
    'return finalizeRow(hook);},',
  ].join('');
}
