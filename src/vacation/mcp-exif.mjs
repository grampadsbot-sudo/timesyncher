const TAG_DATE_TIME = 0x0132;
const TAG_EXIF_IFD = 0x8769;
const TAG_GPS_IFD = 0x8825;
const TAG_DATE_TIME_ORIGINAL = 0x9003;
const TAG_DATE_TIME_DIGITIZED = 0x9004;
const TAG_OFFSET_TIME_ORIGINAL = 0x9011;
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
  if (exifIfdOffset > 0) {
    for (const entry of parseIfdEntries(buffer, tiffStart, exifIfdOffset, littleEndian)) {
      if (entry.tag === TAG_DATE_TIME_ORIGINAL) dateTimeOriginal = readAscii(buffer, tiffStart, entry.entryOffset, entry.count, littleEndian);
      if (entry.tag === TAG_DATE_TIME_DIGITIZED) dateTimeDigitized = readAscii(buffer, tiffStart, entry.entryOffset, entry.count, littleEndian);
      if (entry.tag === TAG_OFFSET_TIME_ORIGINAL) offsetText = readAscii(buffer, tiffStart, entry.entryOffset, entry.count, littleEndian);
    }
  }
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
  const capturedAtIso = normalizeExifTimestamp(capturedAtRaw, offsetText || null);
  const hasExif = Boolean(capturedAtRaw || (lat !== null && lng !== null));
  return {
    hasExif,
    capturedAtRaw,
    offsetText: offsetText || null,
    capturedAtIso,
    lat,
    lng,
  };
}

export function normalizeExifTimestamp(rawValue, offsetText = null) {
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
    if (/(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw)) return parsed.toISOString();
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
