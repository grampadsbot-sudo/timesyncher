function escapePdfText(value) {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function foldPdfLine(value) {
  return String(value || '')
    .replace(/\u2019/g, "'")
    .replace(/\u2018/g, "'")
    .replace(/\u201c/g, '"')
    .replace(/\u201d/g, '"')
    .replace(/\u2014/g, '-')
    .replace(/\u2013/g, '-')
    .replace(/\u02bb/g, "'")
    .replace(/\u02bc/g, "'")
    .replace(/\u2026/g, '...')
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, '?')
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

export function renderMinimalTextPdf({ title = 'Report', lines = [] } = {}) {
  const bodyLines = [];
  bodyLines.push(...wrapLines(title, 80));
  bodyLines.push('');
  for (const row of lines) {
    bodyLines.push(...wrapLines(row, 92));
    bodyLines.push('');
  }
  while (bodyLines.length > 1 && bodyLines[bodyLines.length - 1] === '') bodyLines.pop();

  const fontSize = 11;
  const leading = 14;
  const startY = 760;
  const perPage = 50;
  const pages = [];
  for (let index = 0; index < bodyLines.length; index += perPage) {
    pages.push(bodyLines.slice(index, index + perPage));
  }
  if (!pages.length) pages.push(['']);

  const objects = [];
  const pageCount = pages.length;
  const kids = pages.map((_, index) => `${4 + index * 2} 0 R`).join(' ');
  objects.push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
  objects.push(`2 0 obj\n<< /Type /Pages /Kids [${kids}] /Count ${pageCount} >>\nendobj\n`);
  objects.push('3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n');
  pages.forEach((pageLines, pageIndex) => {
    const pageId = 4 + pageIndex * 2;
    const contentId = pageId + 1;
    const commands = ['BT', `/F1 ${fontSize} Tf`, `${leading} TL`, `72 ${startY} Td`];
    pageLines.forEach((line, index) => {
      if (index > 0) commands.push('T*');
      commands.push(`(${escapePdfText(line)}) Tj`);
    });
    commands.push('ET');
    const stream = `${commands.join('\n')}\n`;
    objects.push(
      `${pageId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] `
      + `/Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>\nendobj\n`,
    );
    objects.push(
      `${contentId} 0 obj\n<< /Length ${Buffer.byteLength(stream, 'utf8')} >>\nstream\n${stream}endstream\nendobj\n`,
    );
  });

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (const object of objects) {
    offsets.push(Buffer.byteLength(pdf, 'utf8'));
    pdf += object;
  }
  const xrefStart = Buffer.byteLength(pdf, 'utf8');
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let index = 1; index <= objects.length; index += 1) {
    pdf += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
  pdf += `startxref\n${xrefStart}\n%%EOF\n`;
  return Buffer.from(pdf, 'utf8');
}
