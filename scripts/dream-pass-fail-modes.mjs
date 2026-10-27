import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const CONSTRAINTS = {
  gather_no_pages: 'Persist a named empty-source failure after bounded gather attempts; do not close without usable evidence.',
  empty_regather_with_saved_pages: 'Reuse verified saved pages for text repair; an empty re-gather must not discard existing evidence or loop unchanged.',
  presented_fields_not_ok: 'Check persisted presented fields before completion; preserve supported fields and return the specific failing reasons.',
  per_row_timeout: 'Bound each row deadline and retain row identity, partial progress and a named resumable timeout.',
  flight_car_path_gap: 'Include flight and car rows in operator inventory and use their transport identity and evidence paths.',
  silent_done: 'Reject done when the same row still needs fill, lacks payload, or fails presented checks.',
  silent_done_blocked: 'Keep the named silent-done rejection and repair its payload or presented failure before retrying completion.',
};
const TIME_KEYS = ['t', 'timestamp', 'as_of', 'at', 'updatedAt', 'createdAt', 'time'];
const ROW_KEYS = ['rowId', 'placeId', 'thingId', 'row_id', 'place_id'];
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const iso = (value) => typeof value === 'string' && /^\d{4}-\d\d-\d\dT/.test(value) && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
const rowId = (value) => object(value) ? ROW_KEYS.map((key) => value[key]).find((id) => typeof id === 'string' || typeof id === 'number') : undefined;
const timestamp = (value, fallback) => TIME_KEYS.map((key) => iso(value[key])).find(Boolean) || fallback;
const render = (value) => typeof value === 'string' ? value : JSON.stringify(value).replace(/\\"/g, '"');
const field = (text, key) => new RegExp(`["']?\\b${key}["']?\\s*[:=]\\s*["']?([^"',}\\s]+)`, 'i').exec(text)?.[1];
const number = (text, key) => Number(field(text, key));

function signals(text, transport = false) {
  const found = new Set();
  for (const id of Object.keys(CONSTRAINTS)) if (new RegExp(`\\b${id}\\b`, 'i').test(text)) found.add(id);
  if (/\bsilent_done\b|\bsilent[- ]done\b/i.test(text)) found.add('silent_done');
  const saved = number(text, 'pageCount') > 0 || number(text, 'savedPages') > 0 || /saved pages/i.test(text);
  const regather = /re[-_ ]?gather/i.test(text) || field(text, 'path') === 'gather';
  const empty = number(text, 'pagesAdded') === 0 || /empty|gather_no_pages/i.test(text);
  if (saved && regather && empty) found.add('empty_regather_with_saved_pages');
  if (/\btimeout\b|timed[-_ ]out|deadline_exceeded|TimeoutError/i.test(text)) found.add('per_row_timeout');
  const gap = /\b(?:gap|gaps|missing|empty|excluded|omitted|zero)\b|not included|stopped at|zero.*fillTargets/i.test(text);
  if ((transport || /\b(?:flights?|cars?)\b/i.test(text)) && (gap || found.has('gather_no_pages') || found.has('presented_fields_not_ok'))) found.add('flight_car_path_gap');
  if (field(text, 'checkpoint') === 'done' && (field(text, 'needsFill')?.toLowerCase() === 'true' || field(text, 'presented')?.toLowerCase() === 'false' || number(text, 'pageCount') === 0 || found.has('presented_fields_not_ok'))) found.add('silent_done');
  return found;
}

function artifactKind(name) {
  if (name === 'RESULT.json' || /^metrics-.*\.json$/.test(name)) return 'json';
  if (name === 'fill-calls.jsonl') return 'jsonl';
  if (name === 'RECEIPT.md' || /-runner\.log$|-DONE$|GATE-FAIL/.test(name)) return 'text';
  return null;
}

function globRegex(segment) {
  return new RegExp(`^${segment.split('').map((c) => c === '*' ? '.*' : c === '?' ? '.' : c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('')}$`);
}

function expand(pattern, diagnostics) {
  let paths = [path.parse(path.resolve(pattern)).root];
  for (const segment of path.resolve(pattern).split(path.sep).filter(Boolean)) {
    const next = [];
    for (const parent of paths) {
      if (!/[*?]/.test(segment)) { next.push(path.join(parent, segment)); continue; }
      try {
        const re = globRegex(segment);
        next.push(...fs.readdirSync(parent).filter((name) => re.test(name)).map((name) => path.join(parent, name)));
      } catch (error) { diagnostics.push({ path: parent, reason: error.code || error.message }); }
    }
    paths = next;
  }
  if (!paths.length) diagnostics.push({ path: pattern, reason: 'no_glob_matches' });
  return paths;
}

function jobDirs(inputs, diagnostics) {
  const dirs = new Set();
  for (const input of inputs) for (const candidate of expand(input, diagnostics)) {
    try {
      if (!fs.lstatSync(candidate).isDirectory()) { diagnostics.push({ path: candidate, reason: 'not_directory' }); continue; }
      const names = fs.readdirSync(candidate);
      if (names.some(artifactKind)) dirs.add(candidate);
      else for (const name of names) {
        const child = path.join(candidate, name);
        if (fs.lstatSync(child).isDirectory() && fs.readdirSync(child).some(artifactKind)) dirs.add(child);
      }
    } catch (error) { diagnostics.push({ path: candidate, reason: error.code || error.message }); }
  }
  return [...dirs].sort();
}

export function extractFailModes(inputs, since) {
  const sinceTime = iso(since);
  if (!sinceTime) throw new Error('--since requires an ISO date/time with T');
  const diagnostics = [];
  const dirs = jobDirs(inputs, diagnostics);
  const stats = { jobs: dirs.length, filesRead: 0, unknownFiles: 0, skippedEntries: 0, malformedFiles: 0, malformedRecords: 0, recordsBeforeSince: 0, duplicateEvidence: 0 };
  const events = new Map();
  const add = (mode, context, evidenceKind) => {
    if (context.seen < sinceTime) { stats.recordsBeforeSince += 1; return; }
    const key = JSON.stringify([mode, context.jobDir, context.rowId == null ? null : String(context.rowId), evidenceKind]);
    let event = events.get(key);
    if (!event) {
      event = { mode, job: context.job, jobDir: context.jobDir, rowId: context.rowId ?? null, evidenceKind, firstSeen: context.seen, lastSeen: context.seen, sources: [] };
      events.set(key, event);
    } else stats.duplicateEvidence += 1;
    if (context.seen < event.firstSeen) event.firstSeen = context.seen;
    if (context.seen > event.lastSeen) event.lastSeen = context.seen;
    const source = `${context.file}:${context.location}`;
    if (!event.sources.includes(source)) event.sources.push(source);
  };
  for (const dir of dirs) {
    const metrics = [];
    const doneRows = [];
    let entries;
    try { entries = fs.readdirSync(dir).sort(); }
    catch (error) { diagnostics.push({ path: dir, reason: error.code || error.message }); continue; }
    for (const name of entries) {
      const file = path.join(dir, name);
      const kind = artifactKind(name);
      let stat;
      try { stat = fs.lstatSync(file); }
      catch (error) { diagnostics.push({ path: file, reason: error.code || error.message }); continue; }
      if (!stat.isFile()) { stats.skippedEntries += 1; continue; }
      if (!kind) { stats.unknownFiles += 1; continue; }
      let raw;
      try { raw = fs.readFileSync(file, 'utf8'); stats.filesRead += 1; }
      catch (error) { stats.malformedFiles += 1; diagnostics.push({ path: file, reason: error.code || error.message }); continue; }
      const base = { job: path.basename(dir), jobDir: dir, file, location: '1', seen: stat.mtime.toISOString() };
      const inspect = (value, context, depth = 0) => {
        if (depth > 100) throw new Error('nesting_limit');
        if (Array.isArray(value)) { value.forEach((entry, i) => inspect(entry, { ...context, location: `${context.location}/${i}` }, depth + 1)); return; }
        if (!object(value)) return;
        const ownRow = rowId(value);
        const ctx = { ...context, seen: timestamp(value, context.seen), rowId: ownRow ?? context.rowId };
        if (ownRow !== undefined) {
          const text = render(value);
          const transport = /^(flight|car)$/.test(value.type || value.category || '');
          for (const mode of signals(text, transport)) add(mode, ctx, 'row');
          if (field(text, 'checkpoint') === 'done') doneRows.push(ctx);
          return;
        }
        const scalars = Object.fromEntries(Object.entries(value).filter(([, entry]) => entry === null || typeof entry !== 'object'));
        for (const mode of signals(render(scalars))) add(mode, ctx, 'record');
        for (const [key, entry] of Object.entries(value)) if (entry && typeof entry === 'object') inspect(entry, { ...ctx, location: `${ctx.location}/${key}` }, depth + 1);
      };
      if (kind === 'text') {
        for (const [i, line] of raw.split(/\r?\n/).entries()) {
          if (!line.trim() || /^\s*\|.*scripts\/test_|^\s*[-?]+\s*scripts\//.test(line)) continue;
          const seen = iso(line.match(/\d{4}-\d\d-\d\dT[\d:.]+(?:Z|[+-]\d\d:\d\d)/)?.[0]) || base.seen;
          const id = line.match(/\b(?:rowId|placeId|thingId|row|place)["'`]*\s*[:=# ]\s*["'`]?(\d+)\b/i)?.[1];
          for (const mode of signals(line)) add(mode, { ...base, rowId: id, seen, location: String(i + 1) }, 'mention');
        }
        continue;
      }
      let badFile = false;
      let unknownFile = false;
      const records = kind === 'jsonl' ? raw.split(/\r?\n/).map((text, i) => ({ text, location: String(i + 1) })).filter(({ text }) => text.trim()) : [{ text: raw, location: '1' }];
      for (const record of records) {
        let value;
        try { value = JSON.parse(record.text); }
        catch { badFile = true; stats.malformedRecords += 1; diagnostics.push({ path: file, location: record.location, reason: 'invalid_json' }); continue; }
        if (!object(value) && !Array.isArray(value)) { badFile = true; stats.malformedRecords += 1; diagnostics.push({ path: file, location: record.location, reason: 'expected_object_or_array' }); continue; }
        const known = Array.isArray(value) || Object.keys(value).some((key) => [...TIME_KEYS, ...ROW_KEYS, 'results', 'rows', 'errors', 'error', 'status', 'stopReason', 'fillTargets', 'checkpoint', 'resp'].includes(key));
        if (!known) { unknownFile = true; diagnostics.push({ path: file, location: record.location, reason: 'unknown_schema' }); continue; }
        if (/^metrics-/.test(name) && object(value) && 'fillTargets' in value) {
          if (!Array.isArray(value.fillTargets)) { badFile = true; stats.malformedRecords += 1; diagnostics.push({ path: file, reason: 'invalid_fill_targets' }); continue; }
          const valid = value.fillTargets.filter((row) => rowId(row) !== undefined);
          if (valid.length !== value.fillTargets.length) {
            badFile = true;
            stats.malformedRecords += value.fillTargets.length - valid.length;
            diagnostics.push({ path: file, reason: 'invalid_fill_target_rows' });
            value.fillTargets = valid;
          }
        }
        const ctx = { ...base, location: record.location, seen: timestamp(value, base.seen) };
        try { inspect(value, ctx); }
        catch (error) { badFile = true; stats.malformedRecords += 1; diagnostics.push({ path: file, location: record.location, reason: error.message }); continue; }
        if (/^metrics-/.test(name) && object(value) && Array.isArray(value.fillTargets)) metrics.push({ value, ctx, end: /end/.test(name) });
      }
      if (badFile) stats.malformedFiles += 1;
      if (unknownFile) stats.unknownFiles += 1;
    }
    for (const { value, ctx } of metrics) {
      for (const type of ['flight', 'car']) {
        const expected = value.inventory?.byType?.[type] ?? value.byType?.[type]?.total;
        const targets = value.fillTargets.filter((row) => row?.type === type);
        if (expected > targets.length) add('flight_car_path_gap', { ...ctx, rowId: `type:${type}` }, 'record');
        for (const row of targets) if (row.needsFill === true) add('flight_car_path_gap', { ...ctx, rowId: rowId(row) }, 'row');
      }
    }
    const endMetrics = metrics.filter((entry) => entry.end).sort((a, b) => a.ctx.seen.localeCompare(b.ctx.seen)).at(-1);
    if (endMetrics) for (const done of doneRows) {
      const row = endMetrics.value.fillTargets.find((entry) => String(rowId(entry)) === String(done.rowId));
      if (row?.needsFill === true && endMetrics.ctx.seen >= done.seen) {
        add('silent_done', done, 'row');
        add('silent_done', { ...endMetrics.ctx, rowId: done.rowId }, 'row');
      }
    }
  }
  const failModes = Object.entries(CONSTRAINTS).map(([id, constraint]) => {
    const evidence = [...events.values()].filter((event) => event.mode === id).sort((a, b) => a.job.localeCompare(b.job) || String(a.rowId).localeCompare(String(b.rowId)) || a.evidenceKind.localeCompare(b.evidenceKind));
    return {
      id, constraint, count: evidence.length, jobCount: new Set(evidence.map((entry) => entry.jobDir)).size,
      rowEvidenceCount: evidence.filter((entry) => entry.evidenceKind === 'row').length,
      mentionCount: evidence.filter((entry) => entry.evidenceKind === 'mention').length,
      firstSeen: evidence.map((entry) => entry.firstSeen).sort()[0] || null,
      lastSeen: evidence.map((entry) => entry.lastSeen).sort().at(-1) || null,
      examples: evidence.slice(0, 5), evidence,
    };
  });
  return { schemaVersion: 1, since: sinceTime, inputs, jobDirs: dirs, counting: 'Unique (mode, absolute job directory, row ID or null, evidence kind); jobs share a mode entry, repeated artifacts do not add occurrences. Mentions are not measured failures. Missing artifact timestamps use file mtime.', stats, diagnostics, failModes };
}

export function markdownBody(report) {
  const lines = [
    '# Offline dream pass constraints', '',
    `Since: ${report.since}. Source: bot-admin/messages/time-syncher/eggbot-keepset-harness-lifts-20261026 (H2).`, '',
    report.counting, '',
  ];
  for (const mode of report.failModes.filter((entry) => entry.count)) {
    const examples = mode.examples.map((entry) => `${entry.job}${entry.rowId === null ? '' : ` row ${entry.rowId}`} (${entry.evidenceKind}; ${entry.sources[0]})`).join('; ');
    lines.push(`- **${mode.id} → ${mode.constraint}** Count: ${mode.count}; jobs: ${mode.jobCount}; row evidence: ${mode.rowEvidenceCount}; mentions: ${mode.mentionCount}; first: ${mode.firstSeen}; last: ${mode.lastSeen}. Examples: ${examples}`);
  }
  if (!report.failModes.some((entry) => entry.count)) lines.push('No matching fail-mode evidence in the selected interval.');
  lines.push('', `Read ${report.stats.filesRead} files across ${report.stats.jobs} jobs; skipped unknown files: ${report.stats.unknownFiles}, other entries: ${report.stats.skippedEntries}, malformed files: ${report.stats.malformedFiles}, malformed records: ${report.stats.malformedRecords}; access/input diagnostics: ${report.diagnostics.length}.`, '', 'Offline evidence only. Host reviews constraints and updates the existing GBrain page or skill; this tool does not publish or certify live data.', '');
  return lines.join('\n');
}

function main(args) {
  const inputs = [];
  const options = {};
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (['--since', '--json', '--markdown', '--root'].includes(arg)) {
      if (!args[i + 1] || args[i + 1].startsWith('--')) throw new Error(`Missing value for ${arg}`);
      if (arg === '--root') inputs.push(args[++i]);
      else options[arg.slice(2)] = args[++i];
    } else if (arg === '--help') {
      process.stdout.write('Usage: node scripts/dream-pass-fail-modes.mjs JOB_DIR... [--root DIR_OR_GLOB] --since ISO_TIME --json OUTPUT.json --markdown OUTPUT.md\nReads immediate job artifacts; a root scans immediate job subdirectories. Quoted glob paths support * and ?. Does not follow symlinks.\n');
      return;
    } else if (arg.startsWith('--')) throw new Error(`Unknown option ${arg}`);
    else inputs.push(arg);
  }
  if (!inputs.length || !options.json || !options.markdown) throw new Error('Job inputs, --since, --json and --markdown are required (see --help)');
  if (path.resolve(options.json) === path.resolve(options.markdown)) throw new Error('Output paths must differ');
  const report = extractFailModes(inputs, options.since);
  for (const output of [options.json, options.markdown]) {
    if (report.jobDirs.includes(path.dirname(path.resolve(output))) && artifactKind(path.basename(output))) throw new Error('Output must not overwrite an input artifact');
  }
  fs.writeFileSync(options.json, `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(options.markdown, markdownBody(report));
  process.stdout.write(`${JSON.stringify(report.stats)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { main(process.argv.slice(2)); }
  catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}
