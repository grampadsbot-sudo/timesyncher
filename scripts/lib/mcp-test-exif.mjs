import { Readable } from 'node:stream';

export async function invokeRoute(handler, { method = 'GET', url = '/api/mcp', headers = {}, body = null } = {}) {
  const payload = body === null
    ? null
    : (Buffer.isBuffer(body) ? body : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)));
  const req = Readable.from(payload ? [payload] : []);
  req.method = method;
  req.url = url;
  req.headers = { host: 'vacation-staging.timesyncher.com', ...headers };
  req.query = {};
  const resHeaders = {};
  let raw = Buffer.alloc(0);
  const res = {
    statusCode: 200,
    headers: resHeaders,
    setHeader(name, value) { resHeaders[name.toLowerCase()] = value; },
    getHeader(name) { return resHeaders[name.toLowerCase()]; },
    end(chunk) {
      if (chunk !== undefined && chunk !== null) {
        raw = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
      }
    },
  };
  await handler(req, res);
  const text = raw.toString('utf8');
  let json = null;
  try {
    json = JSON.parse(text);
  } catch (error) {
    void error;
  }
  return { statusCode: res.statusCode, headers: resHeaders, raw, text, json };
}

function asciiBuffer(str) {
  return Buffer.from(`${str}\0`, 'ascii');
}

function rationalPair(value) {
  const buf = Buffer.alloc(8);
  buf.writeUInt32LE(Math.round(value * 1000), 0);
  buf.writeUInt32LE(1000, 4);
  return buf;
}

export function buildJpegWithExif({ dateTimeOriginal, offsetTimeOriginal = '', lat = null, lng = null }) {
  const dataChunks = [];
  const baseTiffHeader = 8;
  const hasGps = lat !== null && lng !== null;
  const ifd0Count = hasGps ? 2 : 1;
  const ifd0Size = 2 + ifd0Count * 12 + 4;
  const exifIfdOffset = baseTiffHeader + ifd0Size;
  const exifTags = [];
  if (dateTimeOriginal) exifTags.push({ tag: 0x9003, value: asciiBuffer(dateTimeOriginal) });
  if (offsetTimeOriginal) exifTags.push({ tag: 0x9011, value: asciiBuffer(offsetTimeOriginal) });
  const exifIfdSize = 2 + exifTags.length * 12 + 4;
  const gpsIfdOffset = exifIfdOffset + exifIfdSize;
  const gpsIfdSize = hasGps ? (2 + 4 * 12 + 4) : 0;
  let nextDataOffset = gpsIfdOffset + gpsIfdSize;

  const ifd0 = Buffer.alloc(ifd0Size);
  ifd0.writeUInt16LE(ifd0Count, 0);
  ifd0.writeUInt16LE(0x8769, 2);
  ifd0.writeUInt16LE(4, 4);
  ifd0.writeUInt32LE(1, 6);
  ifd0.writeUInt32LE(exifIfdOffset, 10);
  if (hasGps) {
    ifd0.writeUInt16LE(0x8825, 14);
    ifd0.writeUInt16LE(4, 16);
    ifd0.writeUInt32LE(1, 18);
    ifd0.writeUInt32LE(gpsIfdOffset, 22);
  }

  const exifIfd = Buffer.alloc(exifIfdSize);
  exifIfd.writeUInt16LE(exifTags.length, 0);
  exifTags.forEach((item, index) => {
    const pos = 2 + index * 12;
    exifIfd.writeUInt16LE(item.tag, pos);
    exifIfd.writeUInt16LE(2, pos + 2);
    exifIfd.writeUInt32LE(item.value.length, pos + 4);
    exifIfd.writeUInt32LE(nextDataOffset, pos + 8);
    dataChunks.push(item.value);
    nextDataOffset += item.value.length;
  });

  let gpsIfd = Buffer.alloc(0);
  if (hasGps) {
    const toDms = (deg) => {
      const abs = Math.abs(deg);
      const d = Math.floor(abs);
      const mFloat = (abs - d) * 60;
      const m = Math.floor(mFloat);
      const s = (mFloat - m) * 60;
      return Buffer.concat([rationalPair(d), rationalPair(m), rationalPair(s)]);
    };
    const latBuf = toDms(lat);
    const lngBuf = toDms(lng);
    gpsIfd = Buffer.alloc(gpsIfdSize);
    gpsIfd.writeUInt16LE(4, 0);
    gpsIfd.writeUInt16LE(0x0001, 2);
    gpsIfd.writeUInt16LE(2, 4);
    gpsIfd.writeUInt32LE(2, 6);
    gpsIfd.write(lat < 0 ? 'S' : 'N', 10, 'ascii');
    gpsIfd.writeUInt16LE(0x0002, 14);
    gpsIfd.writeUInt16LE(5, 16);
    gpsIfd.writeUInt32LE(3, 18);
    gpsIfd.writeUInt32LE(nextDataOffset, 22);
    dataChunks.push(latBuf);
    nextDataOffset += latBuf.length;
    gpsIfd.writeUInt16LE(0x0003, 26);
    gpsIfd.writeUInt16LE(2, 28);
    gpsIfd.writeUInt32LE(2, 30);
    gpsIfd.write(lng < 0 ? 'W' : 'E', 34, 'ascii');
    gpsIfd.writeUInt16LE(0x0004, 38);
    gpsIfd.writeUInt16LE(5, 40);
    gpsIfd.writeUInt32LE(3, 42);
    gpsIfd.writeUInt32LE(nextDataOffset, 46);
    dataChunks.push(lngBuf);
    nextDataOffset += lngBuf.length;
  }

  const tiffHeader = Buffer.from([0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00]);
  const tiffBody = Buffer.concat([tiffHeader, ifd0, exifIfd, gpsIfd, ...dataChunks]);
  const exifHeader = Buffer.from('Exif\0\0', 'ascii');
  const app1Len = Buffer.alloc(2);
  app1Len.writeUInt16BE(2 + exifHeader.length + tiffBody.length, 0);
  return Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff, 0xe1]),
    app1Len,
    exifHeader,
    tiffBody,
    Buffer.from([0xff, 0xd9]),
  ]);
}

export function buildPlainJpeg() {
  return Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xd9]);
}
