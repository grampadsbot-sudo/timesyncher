import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

export function readOfflineTestList(dir) {
  let names;
  try {
    names = readdirSync(dir);
  } catch (error) {
    const code = error && error.code ? error.code : 'error';
    throw new Error(`offline-tests.d unreadable (${code})`);
  }
  const files = names.filter((name) => name.endsWith('.txt')).sort();
  if (!files.length) throw new Error('offline-tests.d is empty');
  const tests = [];
  for (const name of files) {
    let text;
    try {
      text = readFileSync(path.join(dir, name), 'utf8');
    } catch (error) {
      const code = error && error.code ? error.code : 'error';
      throw new Error(`offline-tests.d/${name} unreadable (${code})`);
    }
    for (const line of text.split('\n')) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) tests.push(trimmed);
    }
  }
  if (!tests.length) throw new Error('offline-tests.d has no tests');
  return tests;
}
