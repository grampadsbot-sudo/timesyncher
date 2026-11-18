import fs from 'node:fs';
import { redactText } from './redact.mjs';

export function nonEmpty(file) {
  try {
    return fs.statSync(file).size > 0;
  } catch (error) {
    return false;
  }
}

export function scrubFile(file, secrets) {
  if (!fs.existsSync(file)) return;
  fs.writeFileSync(file, redactText(fs.readFileSync(file, 'utf8'), secrets));
}
