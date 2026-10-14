#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  inCommentScope,
  scanComments,
  walkCommentFiles,
} from './lib/comment-tools.mjs';

const repo = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
process.chdir(repo);

const files = walkCommentFiles('.');
const failures = [];
for (const file of files) {
  const text = fs.readFileSync(file, 'utf8');
  failures.push(...scanComments(file, text));
}

if (failures.length) {
  for (const row of failures) {
    process.stderr.write(`${row.file}:${row.line}\n`);
  }
  process.stderr.write(`no-comment check failed (${failures.length} comment(s))\n`);
  process.exit(1);
}

process.stdout.write(`no-comment check passed (${files.length} files scanned)\n`);
