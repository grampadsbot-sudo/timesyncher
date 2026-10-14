#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  collectCommentEvidence,
  stripComments,
  walkCommentFiles,
} from './lib/comment-tools.mjs';

const repo = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
process.chdir(repo);

const files = walkCommentFiles('.');
const evidencePath = path.join(repo, 'docs/comment-audit-evidence.json');
const evidence = collectCommentEvidence(files);
fs.writeFileSync(evidencePath, `${JSON.stringify({ fileCount: files.length, comments: evidence }, null, 2)}\n`);

let changed = 0;
for (const file of files) {
  const ext = path.extname(file);
  const before = fs.readFileSync(file, 'utf8');
  const after = stripComments(before, { ext, file });
  if (after !== before) {
    fs.writeFileSync(file, after);
    changed += 1;
  }
}

process.stdout.write(`stripped comments in ${changed}/${files.length} files; evidence ${evidencePath}\n`);
