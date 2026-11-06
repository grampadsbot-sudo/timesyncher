export function reviewSourceHost(url = '') {
  try { return new URL(url).hostname.replace(/^(www|m|en)\./, ''); } catch { return ''; }
}
