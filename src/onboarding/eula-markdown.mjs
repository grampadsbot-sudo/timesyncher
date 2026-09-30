function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]));
}

function inline(text) {
  return escapeHtml(text).replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
}

function isHeading(line) {
  return /^(#{1,6})[ \t]+\S/.test(line);
}

function isBullet(line) {
  return /^[-*+][ \t]+\S/.test(line);
}

function isNumbered(line) {
  return /^\d+\.[ \t]+\S/.test(line);
}

export function renderEulaMarkdown(markdown) {
  const lines = String(markdown ?? '').replace(/\r\n/g, '\n').split('\n');
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i += 1;
      continue;
    }
    const heading = /^(#{1,6})[ \t]+(.+?)\s*$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      blocks.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      i += 1;
      continue;
    }
    if (isBullet(line)) {
      const items = [];
      while (i < lines.length && isBullet(lines[i])) {
        items.push(`<li>${inline(lines[i].replace(/^[-*+][ \t]+/, ''))}</li>`);
        i += 1;
      }
      blocks.push(`<ul>${items.join('')}</ul>`);
      continue;
    }
    if (isNumbered(line)) {
      const items = [];
      while (i < lines.length && isNumbered(lines[i])) {
        items.push(`<li>${inline(lines[i].replace(/^\d+\.[ \t]+/, ''))}</li>`);
        i += 1;
      }
      blocks.push(`<ol>${items.join('')}</ol>`);
      continue;
    }
    const parts = [];
    while (
      i < lines.length
      && lines[i].trim()
      && !isHeading(lines[i])
      && !isBullet(lines[i])
      && !isNumbered(lines[i])
    ) {
      parts.push(lines[i].trim());
      i += 1;
    }
    blocks.push(`<p>${inline(parts.join(' '))}</p>`);
  }
  return blocks.join('');
}
