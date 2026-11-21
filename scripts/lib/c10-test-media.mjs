import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildJpegWithExif } from './mcp-test-exif.mjs';

function spliceExifIntoValidJpeg(validJpeg, exifOpts) {
  if (!exifOpts) return validJpeg;
  const exifOnly = buildJpegWithExif(exifOpts);
  const app1Segment = exifOnly.subarray(2, exifOnly.length - 2);
  return Buffer.concat([validJpeg.subarray(0, 2), app1Segment, validJpeg.subarray(2)]);
}

function makeColorJpegViaFfmpeg({ color, text, exifOpts = null }) {
  const dir = mkdtempSync(path.join(tmpdir(), 'c10-img-'));
  try {
    const outPath = path.join(dir, 'frame.jpg');
    execFileSync('ffmpeg', [
      '-y', '-f', 'lavfi', '-i', `color=c=${color}:s=320x240:d=1`,
      '-frames:v', '1', '-q:v', '4', outPath,
    ], { stdio: 'ignore' });
    const raw = readFileSync(outPath);
    return spliceExifIntoValidJpeg(raw, exifOpts);
  } catch (error) {
    void error;
    void text;
    return exifOpts ? buildJpegWithExif(exifOpts) : buildJpegWithExif({ dateTimeOriginal: '' });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function buildSyntheticMp4WithCreationTime(isoUtc) {
  const ftyp = Buffer.from([
    0x00, 0x00, 0x00, 0x14, 0x66, 0x74, 0x79, 0x70,
    0x69, 0x73, 0x6f, 0x6d, 0x00, 0x00, 0x02, 0x00,
    0x69, 0x73, 0x6f, 0x6d,
  ]);
  const macSec = Math.floor(Date.parse(isoUtc) / 1000) + 2082844800;
  const mvhd = Buffer.alloc(108);
  mvhd.writeUInt32BE(108, 0);
  mvhd.write('mvhd', 4, 'latin1');
  mvhd.writeUInt32BE(macSec >>> 0, 12);
  mvhd.writeUInt32BE(macSec >>> 0, 16);
  mvhd.writeUInt32BE(1000, 20);
  const moov = Buffer.alloc(8 + mvhd.length);
  moov.writeUInt32BE(moov.length, 0);
  moov.write('moov', 4, 'latin1');
  mvhd.copy(moov, 8);
  return Buffer.concat([ftyp, moov]);
}

function makeVideoMp4({ color, creationTimeIso }) {
  const dir = mkdtempSync(path.join(tmpdir(), 'c10-vid-'));
  try {
    const outPath = path.join(dir, 'clip.mp4');
    execFileSync('ffmpeg', [
      '-y', '-f', 'lavfi', '-i', `color=c=${color}:s=320x240:d=1:r=15`,
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
      '-metadata', `creation_time=${creationTimeIso}`,
      outPath,
    ], { stdio: 'ignore' });
    return readFileSync(outPath);
  } catch (error) {
    void error;
    return buildSyntheticMp4WithCreationTime(creationTimeIso);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export function buildCarmelWeekendFixture() {
  const draft = {
    vacation: {
      title: 'Carmel Weekend',
      destination: 'Carmel-by-the-Sea, CA',
      start_date: '2026-07-03',
      end_date: '2026-07-05',
      timezone: 'America/Los_Angeles',
      currency: 'usd',
      summary: 'Relaxed coastal getaway in Carmel with ocean trails and village dining.',
    },
    days: [
      { day_number: 1, date: '2026-07-03', title: 'Village Lunch & Point Lobos', notes: 'Lunch in town then coastal walk.' },
      { day_number: 2, date: '2026-07-04', title: 'Scenic Coast Drive', notes: 'Cypress vistas and cliff overlooks.' },
      { day_number: 3, date: '2026-07-05', title: 'Morning Espresso & Departure', notes: 'Pack up after coffee.' },
    ],
    restaurants: [
      {
        ref: 'rest-carmel-belle',
        title: 'Carmel Belle',
        description: 'Bright village cafe serving tartines and espresso.',
        day_date: '2026-07-03',
        starts_at: '2026-07-03T12:00:00-07:00',
        total_price_cents: 6200,
        location: { address: 'San Carlos St & Ocean Ave, Carmel-by-the-Sea, CA', lat: 36.5553, lng: -121.9233 },
      },
    ],
    things_to_do: [
      {
        ref: 'act-point-lobos',
        category: 'sightseeing',
        title: 'Point Lobos',
        description: 'Cypress groves, turquoise coves, and sea lions along the coastal reserve.',
        day_date: '2026-07-03',
        starts_at: '2026-07-03T14:30:00-07:00',
        total_price_cents: 1000,
        location: { address: '62 CA-1, Carmel-by-the-Sea, CA', lat: 36.515, lng: -121.943 },
      },
      {
        ref: 'act-17-mile',
        category: 'sightseeing',
        title: '17-Mile Drive',
        description: 'Coastal scenic loop past Lone Cypress and Spanish Bay.',
        day_date: '2026-07-04',
        starts_at: '2026-07-04T10:00:00-07:00',
        total_price_cents: 1200,
        location: { address: '17-Mile Dr, Pebble Beach, CA', lat: 36.578, lng: -121.964 },
      },
    ],
    unscheduled_things: [
      {
        ref: 'store-pilgrims',
        category: 'store',
        title: 'Pilgrim Way Bookshop',
        description: 'Independent bookstore with a secret courtyard garden.',
        location: { address: 'Dolores St, Carmel-by-the-Sea, CA', lat: 36.5542, lng: -121.9219 },
      },
    ],
  };

  const mediaFiles = [
    {
      key: 'carmelBellePhoto',
      filename: 'carmel-belle-brunch.jpg',
      mime_type: 'image/jpeg',
      media_kind: 'photo',
      caption: 'Lunch table at Carmel Belle',
      bytes: makeColorJpegViaFfmpeg({
        color: '#d97706',
        text: 'Carmel Belle',
        exifOpts: { dateTimeOriginal: '2026:07:03 12:20:00', offsetTimeOriginal: '-07:00', lat: 36.5553, lng: -121.9233 },
      }),
    },
    {
      key: 'pointLobosPhoto',
      filename: 'point-lobos-cove.jpg',
      mime_type: 'image/jpeg',
      media_kind: 'photo',
      caption: 'China Cove overlook at Point Lobos',
      bytes: makeColorJpegViaFfmpeg({
        color: '#0284c7',
        text: 'Point Lobos',
        exifOpts: { dateTimeOriginal: '2026:07:03 15:10:00', offsetTimeOriginal: '-07:00', lat: 36.515, lng: -121.943 },
      }),
    },
    {
      key: 'pointLobosVideo',
      filename: 'point-lobos-waves.mp4',
      mime_type: 'video/mp4',
      media_kind: 'video',
      thing_ref: 'act-point-lobos',
      caption: 'Ocean waves at Point Lobos',
      bytes: makeVideoMp4({ color: '#0369a1', creationTimeIso: '2026-07-03T22:30:00Z' }),
    },
    {
      key: 'unscheduledBookshopPhoto',
      filename: 'pilgrims-courtyard.jpg',
      mime_type: 'image/jpeg',
      media_kind: 'photo',
      thing_ref: 'store-pilgrims',
      caption: 'Garden path at Pilgrim Way Bookshop',
      bytes: makeColorJpegViaFfmpeg({ color: '#15803d', text: 'Bookshop' }),
    },
    {
      key: 'day2UnmatchedPhoto',
      filename: 'day2-coastal-bluffs.jpg',
      mime_type: 'image/jpeg',
      media_kind: 'photo',
      caption: 'Afternoon cypress overlook',
      bytes: makeColorJpegViaFfmpeg({
        color: '#0f766e',
        text: 'Day 2 Coast',
        exifOpts: { dateTimeOriginal: '2026:07:04 14:15:00', offsetTimeOriginal: '-07:00' },
      }),
    },
    {
      key: 'day2UnmatchedVideo',
      filename: 'day2-surf-video.mp4',
      mime_type: 'video/mp4',
      media_kind: 'video',
      caption: 'Afternoon surf clip',
      bytes: makeVideoMp4({ color: '#1d4ed8', creationTimeIso: '2026-07-04T22:00:00Z' }),
    },
    {
      key: 'undatedPhoto',
      filename: 'undated-seashell.jpg',
      mime_type: 'image/jpeg',
      media_kind: 'photo',
      caption: 'Found shell',
      bytes: makeColorJpegViaFfmpeg({ color: '#be123c', text: 'Undated' }),
    },
    {
      key: 'outOfRangePhoto',
      filename: 'old-december-photo.jpg',
      mime_type: 'image/jpeg',
      media_kind: 'photo',
      caption: 'Winter archive photo',
      bytes: makeColorJpegViaFfmpeg({
        color: '#6d28d9',
        text: 'Archive',
        exifOpts: { dateTimeOriginal: '2025:12:20 11:00:00', offsetTimeOriginal: '-08:00' },
      }),
    },
  ];

  return { draft, mediaFiles };
}
