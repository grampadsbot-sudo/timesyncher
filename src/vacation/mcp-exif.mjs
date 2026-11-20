const TAG_DATE_TIME = 0x0132;
const TAG_EXIF_IFD = 0x8769;
const TAG_GPS_IFD = 0x8825;
const TAG_DATE_TIME_ORIGINAL = 0x9003;
const TAG_DATE_TIME_DIGITIZED = 0x9004;
const TAG_OFFSET_TIME = 0x9010;
const TAG_OFFSET_TIME_ORIGINAL = 0x9011;
const TAG_OFFSET_TIME_DIGITIZED = 0x9012;
const TAG_GPS_LAT_REF = 0x0001;
const TAG_GPS_LAT = 0x0002;
const TAG_GPS_LNG_REF = 0x0003;
const TAG_GPS_LNG = 0x0004;

function readUint16(buf, offset, littleEndian) {
  if (offset < 0 || offset + 2 > buf.length) return 0;
  return littleEndian ? buf.readUInt16LE(offset) : buf.readUInt16BE(offset);
}

function readUint32(buf, offset, littleEndian) {
  if (offset < 0 || offset + 4 > buf.length) return 0;
  return littleEndian ? buf.readUInt32LE(offset) : buf.readUInt32BE(offset);
}

function readAscii(buf, tiffStart, entryOffset, count, littleEndian) {
  if (count <= 0) return '';
  const dataOffset = count <= 4 ? entryOffset + 8 : tiffStart + readUint32(buf, entryOffset + 8, littleEndian);
  if (dataOffset < 0 || dataOffset + count > buf.length) return '';
  return buf.subarray(dataOffset, dataOffset + count).toString('ascii').replace(/\0+$/, '').trim();
}

function readRationals(buf, tiffStart, entryOffset, count, littleEndian) {
  const dataOffset = tiffStart + readUint32(buf, entryOffset + 8, littleEndian);
  if (dataOffset < 0 || dataOffset + count * 8 > buf.length) return [];
  const out = [];
  for (let i = 0; i < count; i += 1) {
    const num = readUint32(buf, dataOffset + i * 8, littleEndian);
    const den = readUint32(buf, dataOffset + i * 8 + 4, littleEndian);
    out.push(den ? num / den : 0);
  }
  return out;
}

function parseIfdEntries(buf, tiffStart, ifdOffset, littleEndian) {
  const start = tiffStart + ifdOffset;
  if (start < tiffStart || start + 2 > buf.length) return [];
  const count = readUint16(buf, start, littleEndian);
  const entries = [];
  for (let i = 0; i < count; i += 1) {
    const entryOffset = start + 2 + i * 12;
    if (entryOffset + 12 > buf.length) break;
    entries.push({
      tag: readUint16(buf, entryOffset, littleEndian),
      type: readUint16(buf, entryOffset + 2, littleEndian),
      count: readUint32(buf, entryOffset + 4, littleEndian),
      valueOffset: readUint32(buf, entryOffset + 8, littleEndian),
      entryOffset,
    });
  }
  return entries;
}

function dmsToDecimal(dms, ref) {
  if (!Array.isArray(dms) || dms.length < 3) return null;
  const value = dms[0] + dms[1] / 60 + dms[2] / 3600;
  if (!Number.isFinite(value)) return null;
  const sign = ref === 'S' || ref === 'W' ? -1 : 1;
  return Number((value * sign).toFixed(6));
}

function findExifTiffStart(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 14) return -1;
  if (buffer[0] !== 0xff || buffer[1] !== 0xd8) return -1;
  let offset = 2;
  while (offset + 4 <= buffer.length) {
    if (buffer[offset] !== 0xff) break;
    const marker = buffer[offset + 1];
    if (marker === 0xda || marker === 0xd9) break;
    const segmentLength = buffer.readUInt16BE(offset + 2);
    if (segmentLength < 2) break;
    if (marker === 0xe1 && offset + 10 <= buffer.length) {
      const header = buffer.subarray(offset + 4, offset + 10).toString('ascii');
      if (header === 'Exif\0\0') return offset + 10;
    }
    offset += 2 + segmentLength;
  }
  return -1;
}

export function extractExifFromBuffer(buffer) {
  const empty = { hasExif: false, capturedAtRaw: null, offsetText: null, capturedAtIso: null, lat: null, lng: null };
  const tiffStart = findExifTiffStart(buffer);
  if (tiffStart < 0 || tiffStart + 8 > buffer.length) return empty;
  const byteOrder = buffer.subarray(tiffStart, tiffStart + 2).toString('ascii');
  const littleEndian = byteOrder === 'II';
  if (!littleEndian && byteOrder !== 'MM') return empty;
  const ifd0Offset = readUint32(buffer, tiffStart + 4, littleEndian);
  const ifd0 = parseIfdEntries(buffer, tiffStart, ifd0Offset, littleEndian);
  let dateTime = '';
  let exifIfdOffset = 0;
  let gpsIfdOffset = 0;
  for (const entry of ifd0) {
    if (entry.tag === TAG_DATE_TIME) dateTime = readAscii(buffer, tiffStart, entry.entryOffset, entry.count, littleEndian);
    if (entry.tag === TAG_EXIF_IFD) exifIfdOffset = entry.valueOffset;
    if (entry.tag === TAG_GPS_IFD) gpsIfdOffset = entry.valueOffset;
  }
  let dateTimeOriginal = '';
  let dateTimeDigitized = '';
  let offsetText = '';
  let offsetFallback = '';
  if (exifIfdOffset > 0) {
    for (const entry of parseIfdEntries(buffer, tiffStart, exifIfdOffset, littleEndian)) {
      if (entry.tag === TAG_DATE_TIME_ORIGINAL) dateTimeOriginal = readAscii(buffer, tiffStart, entry.entryOffset, entry.count, littleEndian);
      if (entry.tag === TAG_DATE_TIME_DIGITIZED) dateTimeDigitized = readAscii(buffer, tiffStart, entry.entryOffset, entry.count, littleEndian);
      if (entry.tag === TAG_OFFSET_TIME_ORIGINAL) offsetText = readAscii(buffer, tiffStart, entry.entryOffset, entry.count, littleEndian);
      if ((entry.tag === TAG_OFFSET_TIME || entry.tag === TAG_OFFSET_TIME_DIGITIZED) && !offsetFallback) {
        offsetFallback = readAscii(buffer, tiffStart, entry.entryOffset, entry.count, littleEndian);
      }
    }
  }
  const effectiveOffset = offsetText || offsetFallback || '';
  let latRef = '';
  let lngRef = '';
  let latDms = [];
  let lngDms = [];
  if (gpsIfdOffset > 0) {
    for (const entry of parseIfdEntries(buffer, tiffStart, gpsIfdOffset, littleEndian)) {
      if (entry.tag === TAG_GPS_LAT_REF) latRef = readAscii(buffer, tiffStart, entry.entryOffset, entry.count, littleEndian);
      if (entry.tag === TAG_GPS_LNG_REF) lngRef = readAscii(buffer, tiffStart, entry.entryOffset, entry.count, littleEndian);
      if (entry.tag === TAG_GPS_LAT) latDms = readRationals(buffer, tiffStart, entry.entryOffset, entry.count, littleEndian);
      if (entry.tag === TAG_GPS_LNG) lngDms = readRationals(buffer, tiffStart, entry.entryOffset, entry.count, littleEndian);
    }
  }
  const capturedAtRaw = dateTimeOriginal || dateTimeDigitized || dateTime || null;
  const lat = dmsToDecimal(latDms, latRef);
  const lng = dmsToDecimal(lngDms, lngRef);
  const capturedAtIso = normalizeExifTimestamp(capturedAtRaw, effectiveOffset || null);
  const hasExif = Boolean(capturedAtRaw || (lat !== null && lng !== null));
  return {
    hasExif,
    capturedAtRaw,
    offsetText: effectiveOffset || null,
    capturedAtIso,
    lat,
    lng,
  };
}

export function normalizeExifTimestamp(rawValue, offsetText = null) {
  if (rawValue instanceof Date) {
    return Number.isNaN(rawValue.getTime()) ? null : rawValue.toISOString();
  }
  const raw = String(rawValue || '').trim();
  if (!raw) return null;
  const exifMatch = raw.match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(.*)$/);
  if (exifMatch) {
    const base = `${exifMatch[1]}-${exifMatch[2]}-${exifMatch[3]}T${exifMatch[4]}:${exifMatch[5]}:${exifMatch[6]}`;
    const suffix = String(exifMatch[7] || offsetText || '').trim();
    if (suffix && /^(?:Z|[+-]\d{2}:?\d{2})$/i.test(suffix)) {
      const normalizedOffset = suffix.length === 5 && /^[+-]\d{4}$/.test(suffix)
        ? `${suffix.slice(0, 3)}:${suffix.slice(3)}`
        : suffix;
      const parsed = new Date(`${base}${normalizedOffset}`);
      return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
    }
    return base;
  }
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    if (/(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw) || /\bGMT[+-]\d{4}\b/.test(raw)) return parsed.toISOString();
    const isoMatch = raw.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})/);
    if (isoMatch) return `${isoMatch[1]}T${isoMatch[2]}`;
  }
  return null;
}

function localDateInTimeZone(isoInstant, timeZone) {
  const date = new Date(isoInstant);
  if (Number.isNaN(date.getTime())) return null;
  const tz = String(timeZone || 'UTC').trim() || 'UTC';
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);
    const year = parts.find((part) => part.type === 'year')?.value;
    const month = parts.find((part) => part.type === 'month')?.value;
    const day = parts.find((part) => part.type === 'day')?.value;
    if (year && month && day) return `${year}-${month}-${day}`;
    return null;
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

export function resolveLocalCaptureDate({ capturedAt, offsetText = null, vacationTimeZone = 'UTC' }) {
  const normalized = normalizeExifTimestamp(capturedAt, offsetText);
  if (!normalized) return null;
  if (/(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized)) {
    return localDateInTimeZone(normalized, vacationTimeZone);
  }
  const dateOnly = normalized.match(/^(\d{4}-\d{2}-\d{2})/);
  return dateOnly ? dateOnly[1] : null;
}

export function resolveMediaDayAssignment({
  capturedAt = null,
  offsetText = null,
  vacationTimeZone = 'UTC',
  dayDates = [],
  thingRef = null,
}) {
  const orderedDates = Array.isArray(dayDates)
    ? dayDates.map((d) => String(d || '').slice(0, 10)).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
    : [];
  const localDate = resolveLocalCaptureDate({ capturedAt, offsetText, vacationTimeZone });
  const dayIndex = localDate ? orderedDates.indexOf(localDate) : -1;
  if (dayIndex >= 0) {
    return {
      bucket: thingRef ? 'thing' : 'day',
      dayDate: orderedDates[dayIndex],
      dayNumber: dayIndex + 1,
      localCaptureDate: localDate,
    };
  }
  if (thingRef) {
    return {
      bucket: 'thing',
      dayDate: null,
      dayNumber: null,
      localCaptureDate: localDate,
    };
  }
  return {
    bucket: 'unassigned',
    dayDate: null,
    dayNumber: null,
    localCaptureDate: localDate,
  };
}

const DESTINATION_TZ_RULES = [
  [/\b(?:honolulu|maui|kauai|oahu|kona|hawaii|hi)\b/i, 'Pacific/Honolulu'],
  [/\b(?:anchorage|juneau|fairbanks|alaska|ak)\b/i, 'America/Anchorage'],
  [/\b(?:carmel|monterey|big sur|san francisco|los angeles|san diego|napa|sonoma|santa barbara|palm springs|tahoe|yosemite|california|ca|seattle|portland|astoria|bend|oregon|or|washington|wa|reno|nevada|nv|vancouver|victoria|british columbia)\b/i, 'America/Los_Angeles'],
  [/\b(?:phoenix|scottsdale|sedona|tucson|arizona|az)\b/i, 'America/Phoenix'],
  [/\b(?:denver|aspen|vail|boulder|colorado|co|salt lake|park city|moab|utah|ut|bozeman|jackson hole|montana|mt|wyoming|wy|santa fe|albuquerque|new mexico|nm|boise|idaho|id|banff|calgary)\b/i, 'America/Denver'],
  [/\b(?:chicago|austin|dallas|houston|san antonio|texas|tx|new orleans|louisiana|la|nashville|memphis|tennessee|tn|minneapolis|minnesota|mn|illinois|il|wisconsin|wi|missouri|mo|mexico city|cancun|tulum|playa del carmen)\b/i, 'America/Chicago'],
  [/\b(?:new york|nyc|manhattan|brooklyn|boston|massachusetts|ma|miami|orlando|key west|tampa|florida|fl|atlanta|savannah|georgia|ga|charleston|south carolina|sc|asheville|charlotte|north carolina|nc|washington,?\s*dc|d\.c\.|virginia|va|philadelphia|pennsylvania|pa|new jersey|nj|maine|me|vermont|vt|toronto|montreal)\b/i, 'America/New_York'],
  [/\b(?:london|edinburgh|uk|united kingdom|england|scotland|dublin|ireland|lisbon|portugal)\b/i, 'Europe/London'],
  [/\b(?:paris|france|rome|florence|venice|milan|amalfi|italy|barcelona|madrid|spain|amsterdam|netherlands|zurich|geneva|switzerland|berlin|munich|germany|vienna|austria|prague|copenhagen|stockholm|oslo)\b/i, 'Europe/Paris'],
  [/\b(?:athens|santorini|mykonos|greece)\b/i, 'Europe/Athens'],
  [/\b(?:tokyo|kyoto|osaka|japan)\b/i, 'Asia/Tokyo'],
  [/\b(?:sydney|melbourne|australia)\b/i, 'Australia/Sydney'],
];

function validIanaTimeZone(value) {
  const tz = String(value || '').trim();
  if (!tz) return '';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return tz;
  } catch (error) {
    void error;
    return '';
  }
}

function inferTimeZoneFromCoords(lat, lng) {
  const la = Number(lat);
  const ln = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return '';
  if (la >= 18 && la <= 23 && ln >= -161 && ln <= -154) return 'Pacific/Honolulu';
  if (la >= 51 && la <= 72 && ln >= -170 && ln <= -129) return 'America/Anchorage';
  if (la >= 24 && la <= 50 && ln >= -126 && ln <= -114.5) return 'America/Los_Angeles';
  if (la >= 31 && la <= 37 && ln > -114.5 && ln <= -109) return 'America/Phoenix';
  if (la >= 24 && la <= 50 && ln > -114.5 && ln <= -102) return 'America/Denver';
  if (la >= 24 && la <= 50 && ln > -102 && ln <= -85.5) return 'America/Chicago';
  if (la >= 24 && la <= 50 && ln > -85.5 && ln <= -66) return 'America/New_York';
  if (la >= 49 && la <= 61 && ln >= -11 && ln <= 2) return 'Europe/London';
  if (la >= 36 && la <= 56 && ln > 2 && ln <= 20) return 'Europe/Paris';
  if (la >= 30 && la <= 46 && ln >= 129 && ln <= 146) return 'Asia/Tokyo';
  return '';
}

export function inferVacationTimeZone({ timezone = '', timezoneExplicit = false, destination = '', points = [] } = {}) {
  const explicit = validIanaTimeZone(timezone);
  if (explicit && (explicit.toUpperCase() !== 'UTC' || timezoneExplicit === true)) {
    return explicit;
  }
  const dest = String(destination || '').trim();
  if (dest) {
    for (const [pattern, tz] of DESTINATION_TZ_RULES) {
      if (pattern.test(dest)) return tz;
    }
  }
  for (const point of Array.isArray(points) ? points : []) {
    const inferred = inferTimeZoneFromCoords(point?.lat ?? point?.latitude, point?.lng ?? point?.longitude);
    if (inferred) return inferred;
  }
  return explicit || 'UTC';
}

export function formatLocalClockTime(value, vacationTimeZone = 'UTC') {
  if (!value) return '';
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return '';
    const ampm = trimmed.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i);
    if (ampm) {
      let hour = Number(ampm[1]);
      const min = ampm[2] || '00';
      const meridiem = ampm[3].toLowerCase();
      if (meridiem === 'pm' && hour < 12) hour += 12;
      if (meridiem === 'am' && hour === 12) hour = 0;
      if (hour >= 0 && hour <= 23) return `${String(hour).padStart(2, '0')}:${min}`;
    }
    const hhmm = trimmed.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
    if (hhmm) {
      const hour = Number(hhmm[1]);
      if (hour >= 0 && hour <= 23) return `${String(hour).padStart(2, '0')}:${hhmm[2]}`;
    }
    const localWithOffset = trimmed.match(/^\d{4}-\d{2}-\d{2}[T ](\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?([+-]\d{2}:?\d{2})$/);
    if (localWithOffset) {
      return `${localWithOffset[1]}:${localWithOffset[2]}`;
    }
    const naiveIso = trimmed.match(/^\d{4}-\d{2}-\d{2}[T ](\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/);
    if (naiveIso) {
      return `${naiveIso[1]}:${naiveIso[2]}`;
    }
  }
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return '';
  const tz = validIanaTimeZone(vacationTimeZone) || 'UTC';
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(date);
    const hour = parts.find((part) => part.type === 'hour')?.value;
    const minute = parts.find((part) => part.type === 'minute')?.value;
    if (hour && minute) {
      const h = hour === '24' ? '00' : hour;
      return `${h}:${minute}`;
    }
  } catch (error) {
    void error;
  }
  return `${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')}`;
}
