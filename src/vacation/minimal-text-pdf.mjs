import fs from 'node:fs';

const FONT_URL = new URL('./pdf-fonts/DejaVuSans.ttf', import.meta.url);

let fontCache;

function loadDejaVuFont() {
  if (fontCache) return fontCache;
  const buffer = fs.readFileSync(FONT_URL);
  fontCache = buildFontFace(buffer);
  return fontCache;
}

function readU16(buf, offset) {
  return buf.readUInt16BE(offset);
}

function readU32(buf, offset) {
  return buf.readUInt32BE(offset);
}

function readTableMap(buffer) {
  const numTables = readU16(buffer, 4);
  const map = {};
  for (let index = 0; index < numTables; index += 1) {
    const base = 12 + index * 16;
    const tag = buffer.toString('ascii', base, base + 4);
    map[tag] = {
      offset: readU32(buffer, base + 8),
      length: readU32(buffer, base + 12),
    };
  }
  return map;
}

function tableSlice(buffer, map, tag) {
  const row = map[tag];
  if (!row) throw new Error(`missing ttf table ${tag}`);
  return buffer.subarray(row.offset, row.offset + row.length);
}

function parseCmapTable(cmapBuf) {
  const numSubtables = readU16(cmapBuf, 2);
  let chosen = null;
  for (let index = 0; index < numSubtables; index += 1) {
    const base = 4 + index * 8;
    const platformId = readU16(cmapBuf, base);
    const encodingId = readU16(cmapBuf, base + 2);
    const offset = readU32(cmapBuf, base + 4);
    if (platformId === 3 && encodingId === 1) chosen = offset;
    if (platformId === 0) chosen = offset;
  }
  if (chosen == null) throw new Error('no unicode cmap subtable');
  const format = readU16(cmapBuf, chosen);
  if (format === 4) return parseCmapFormat4(cmapBuf, chosen);
  if (format === 12) return parseCmapFormat12(cmapBuf, chosen);
  throw new Error(`unsupported cmap format ${format}`);
}

function parseCmapFormat4(cmapBuf, offset) {
  const segCountX2 = readU16(cmapBuf, offset + 6);
  const segCount = segCountX2 / 2;
  const endCodes = offset + 14;
  const startCodes = endCodes + segCountX2 + 2;
  const idDelta = startCodes + segCountX2;
  const idRangeOffset = idDelta + segCountX2;
  const glyphIdArrayOffset = idRangeOffset + segCountX2;
  const lookup = new Map();
  for (let index = 0; index < segCount; index += 1) {
    const endCode = readU16(cmapBuf, endCodes + index * 2);
    const startCode = readU16(cmapBuf, startCodes + index * 2);
    const delta = readU16(cmapBuf, idDelta + index * 2);
    const rangeOffset = readU16(cmapBuf, idRangeOffset + index * 2);
    if (startCode === 0xffff && endCode === 0xffff) break;
    for (let code = startCode; code <= endCode; code += 1) {
      let glyphId;
      if (rangeOffset === 0) {
        glyphId = (code + delta) & 0xffff;
      } else {
        const address = glyphIdArrayOffset + rangeOffset + (index * 2) + (code - startCode) * 2;
        glyphId = readU16(cmapBuf, address);
        if (glyphId !== 0) glyphId = (glyphId + delta) & 0xffff;
      }
      if (glyphId !== 0) lookup.set(code, glyphId);
    }
  }
  return (codePoint) => lookup.get(codePoint) ?? 0;
}

function parseCmapFormat12(cmapBuf, offset) {
  const numGroups = readU32(cmapBuf, offset + 12);
  const groups = offset + 16;
  const lookup = new Map();
  for (let index = 0; index < numGroups; index += 1) {
    const base = groups + index * 12;
    const startCharCode = readU32(cmapBuf, base);
    const endCharCode = readU32(cmapBuf, base + 4);
    let startGlyphId = readU32(cmapBuf, base + 8);
    for (let code = startCharCode; code <= endCharCode; code += 1) {
      lookup.set(code, startGlyphId);
      startGlyphId += 1;
    }
  }
  return (codePoint) => lookup.get(codePoint) ?? 0;
}

function parseHorizontalMetrics(hheaBuf, hmtxBuf, numGlyphs) {
  const numberOfHMetrics = readU16(hheaBuf, 34);
  const advanceWidths = [];
  const leftSideBearings = [];
  for (let index = 0; index < numberOfHMetrics; index += 1) {
    advanceWidths.push(readU16(hmtxBuf, index * 4));
    leftSideBearings.push(readU16(hmtxBuf, index * 4 + 2));
  }
  const lastAdvance = advanceWidths.length ? advanceWidths[advanceWidths.length - 1] : 0;
  for (let index = numberOfHMetrics; index < numGlyphs; index += 1) {
    advanceWidths.push(lastAdvance);
    leftSideBearings.push(readU16(hmtxBuf, numberOfHMetrics * 4 + (index - numberOfHMetrics) * 2));
  }
  return advanceWidths;
}

function buildFontFace(ttfBuffer) {
  const map = readTableMap(ttfBuffer);
  const head = tableSlice(ttfBuffer, map, 'head');
  const hhea = tableSlice(ttfBuffer, map, 'hhea');
  const maxp = tableSlice(ttfBuffer, map, 'maxp');
  const hmtx = tableSlice(ttfBuffer, map, 'hmtx');
  const cmap = tableSlice(ttfBuffer, map, 'cmap');
  const unitsPerEm = readU16(head, 18);
  const numGlyphs = readU16(maxp, 4);
  const glyphForCodePoint = parseCmapTable(cmap);
  const advanceWidths = parseHorizontalMetrics(hhea, hmtx, numGlyphs);
  return {
    ttfBuffer,
    unitsPerEm,
    glyphForCodePoint,
    advanceWidths,
  };
}

function foldPdfLine(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function wrapLines(text, maxChars = 92) {
  const words = foldPdfLine(text).split(' ').filter(Boolean);
  if (!words.length) return [''];
  const lines = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [''];
}

function collectGlyphUsage(lines, face) {
  const used = new Map();
  const noteGlyph = (codePoint, gid) => {
    if (!used.has(gid)) used.set(gid, codePoint);
  };
  noteGlyph(0x20, face.glyphForCodePoint(0x20) || 0);
  for (const line of lines) {
    for (const char of line) {
      const codePoint = char.codePointAt(0);
      const gid = face.glyphForCodePoint(codePoint);
      noteGlyph(codePoint, gid);
    }
  }
  return used;
}

function hexPad(value, width = 4) {
  return value.toString(16).toUpperCase().padStart(width, '0');
}

function buildToUnicodeCmap(usedGlyphs) {
  const entries = [...usedGlyphs.entries()]
    .filter(([gid]) => gid > 0)
    .sort((left, right) => left[0] - right[0]);
  const bfchar = entries.map(([gid, codePoint]) => `<${hexPad(gid)}> <${hexPad(codePoint)}>`).join('\n');
  return `/CIDInit /ProcSet findresource begin
12 dict begin
begincmap
/CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> def
/CMapName /DejaVuSans-ToUnicode def
/CMapType 2 def
1 begincodespacerange
<0000> <FFFF>
endcodespacerange
${entries.length} beginbfchar
${bfchar}
endbfchar
endcmap
CMapName currentdict /CMap defineresource pop
end
end
`;
}

function buildFontWidthArray(face, usedGlyphs) {
  const gids = [...usedGlyphs.keys()].sort((left, right) => left - right);
  const parts = [];
  for (const gid of gids) {
    const width = face.advanceWidths[gid] || 0;
    parts.push(gid, Math.round((width * 1000) / face.unitsPerEm));
  }
  return `[${parts.join(' ')}]`;
}

function encodeLineHex(text, face) {
  let hex = '';
  for (const char of text) {
    const gid = face.glyphForCodePoint(char.codePointAt(0));
    hex += hexPad(gid);
  }
  return `<${hex}>`;
}

export function extractMinimalPdfText(pdfBuffer) {
  const pdf = pdfBuffer.toString('latin1');
  const cmapBodyMatch = pdf.match(/begincmap[\s\S]*?endcmap/);
  if (!cmapBodyMatch) return '';
  const gidToUnicode = new Map();
  const bfcharBlock = cmapBodyMatch[0].match(/beginbfchar([\s\S]*?)endbfchar/);
  if (bfcharBlock) {
    const pairs = bfcharBlock[1].match(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g) || [];
    for (const pair of pairs) {
      const match = pair.match(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/);
      if (!match) continue;
      const gid = parseInt(match[1], 16);
      const codePoint = parseInt(match[2], 16);
      gidToUnicode.set(gid, String.fromCodePoint(codePoint));
    }
  }
  let output = '';
  const hexChunks = pdf.matchAll(/<([0-9A-Fa-f]+)>\s*Tj/g);
  for (const chunk of hexChunks) {
    const hex = chunk[1];
    for (let index = 0; index + 4 <= hex.length; index += 4) {
      const gid = parseInt(hex.slice(index, index + 4), 16);
      output += gidToUnicode.get(gid) || '';
    }
    output += '\n';
  }
  return output;
}

function concatPdf(chunks) {
  const parts = [Buffer.from('%PDF-1.4\n', 'utf8')];
  const offsets = [0];
  for (const chunk of chunks) {
    offsets.push(Buffer.concat(parts).length);
    parts.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, 'utf8'));
  }
  let xref = `xref\n0 ${offsets.length}\n0000000000 65535 f \n`;
  for (let index = 1; index < offsets.length; index += 1) {
    xref += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`;
  }
  const xrefStart = Buffer.concat(parts).length;
  parts.push(Buffer.from(`${xref}trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`, 'utf8'));
  return Buffer.concat(parts);
}

export function renderMinimalTextPdf({ title = 'Report', lines = [] } = {}) {
  const face = loadDejaVuFont();
  const bodyLines = [];
  bodyLines.push(...wrapLines(title, 80));
  bodyLines.push('');
  for (const row of lines) {
    bodyLines.push(...wrapLines(row, 92));
    bodyLines.push('');
  }
  while (bodyLines.length > 1 && bodyLines[bodyLines.length - 1] === '') bodyLines.pop();

  const usedGlyphs = collectGlyphUsage(bodyLines, face);
  const fontSize = 11;
  const leading = 14;
  const startY = 760;
  const perPage = 50;
  const pages = [];
  for (let index = 0; index < bodyLines.length; index += perPage) {
    pages.push(bodyLines.slice(index, index + perPage));
  }
  if (!pages.length) pages.push(['']);

  const toUnicodeStream = buildToUnicodeCmap(usedGlyphs);
  const widthArray = buildFontWidthArray(face, usedGlyphs);
  const fontFileBytes = face.ttfBuffer;

  const chunks = [];
  const pageObjectStart = 8;
  const kids = pages.map((_, index) => `${pageObjectStart + index * 2} 0 R`).join(' ');
  chunks.push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
  chunks.push(`2 0 obj\n<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>\nendobj\n`);
  chunks.push(
    Buffer.concat([
      Buffer.from(
        `3 0 obj\n<< /Length ${fontFileBytes.length} /Length1 ${fontFileBytes.length} >>\nstream\n`,
        'utf8',
      ),
      fontFileBytes,
      Buffer.from('\nendstream\nendobj\n', 'utf8'),
    ]),
  );
  chunks.push(
    '4 0 obj\n<< /Type /FontDescriptor /FontName /DejaVuSans '
    + `/Flags 32 /FontBBox [-1021 -463 1793 1232] /ItalicAngle 0 /Ascent 928 /Descent -236 `
    + `/CapHeight 928 /StemV 80 /FontFile2 3 0 R >>\nendobj\n`,
  );
  chunks.push(
    '5 0 obj\n<< /Type /Font /Subtype /CIDFontType2 /BaseFont /DejaVuSans '
    + `/CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> `
    + `/FontDescriptor 4 0 R /W ${widthArray} /CIDToGIDMap /Identity >>\nendobj\n`,
  );
  chunks.push(
    '6 0 obj\n<< /Type /Font /Subtype /Type0 /BaseFont /DejaVuSans /Encoding /Identity-H '
    + `/DescendantFonts [5 0 R] /ToUnicode 7 0 R >>\nendobj\n`,
  );
  chunks.push(
    `7 0 obj\n<< /Length ${Buffer.byteLength(toUnicodeStream, 'utf8')} >>\nstream\n${toUnicodeStream}endstream\nendobj\n`,
  );

  pages.forEach((pageLines, pageIndex) => {
    const pageId = pageObjectStart + pageIndex * 2;
    const contentId = pageId + 1;
    const commands = ['BT', `/F1 ${fontSize} Tf`, `${leading} TL`, `72 ${startY} Td`];
    pageLines.forEach((line, index) => {
      if (index > 0) commands.push('T*');
      if (line) commands.push(`${encodeLineHex(line, face)} Tj`);
      else commands.push('<0020> Tj');
    });
    commands.push('ET');
    const stream = `${commands.join('\n')}\n`;
    chunks.push(
      `${pageId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] `
      + `/Resources << /Font << /F1 6 0 R >> >> /Contents ${contentId} 0 R >>\nendobj\n`,
    );
    chunks.push(
      `${contentId} 0 obj\n<< /Length ${Buffer.byteLength(stream, 'utf8')} >>\nstream\n${stream}endstream\nendobj\n`,
    );
  });

  return concatPdf(chunks);
}
