export function capturedFeatureFilesFromPages(pages) {
  const captured = new Set();
  for (const page of Array.isArray(pages) ? pages : []) {
    if (page?.file) captured.add(page.file);
  }
  return captured;
}
