function attribute(tag, name) {
  const match = tag.match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  return match ? match[1] ?? match[2] ?? match[3] ?? '' : '';
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function iconLinkTagsFromHtml(html = '') {
  const tags = [];
  for (const tag of String(html).match(/<link\b[^>]*>/gi) || []) {
    if (!/(^|\s)(icon|apple-touch-icon|apple-touch-icon-precomposed)(\s|$)/i.test(attribute(tag, 'rel'))) continue;
    tags.push(tag);
  }
  return tags;
}

export function buildIconDeclarationHtml(html, { title = 'Official page' } = {}) {
  const links = iconLinkTagsFromHtml(html);
  const titleMatch = String(html).match(/<title[^>]*>([^<]*)<\/title>/i);
  const pageTitle = titleMatch?.[1]?.trim() || title;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(pageTitle)}</title>
${links.join('\n')}
</head>
<body></body>
</html>
`;
}
