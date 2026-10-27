const at = '2026-10-27T12:00:00Z';
const rows = [
  { t: at, rowId: 11, error: 'gather_no_pages' },
  { t: at, rowId: 12, pageCount: 4, pagesAdded: 0, trace: { gather: { path: 'gather' } } },
  { t: at, rowId: 13, error: 'presented_fields_not_ok' },
  { t: at, rowId: 14, error: 'The operation was aborted due to timeout' },
  { t: at, rowId: 15, type: 'flight', error: 'route path missing' },
  { t: at, rowId: 16, checkpoint: 'done', needsFill: true },
  { t: at, rowId: 17, checkpoint: 'failed-presented', stopReason: 'silent_done_blocked' },
];
export const fixtureRows = rows;
export const fixtureJobs = {
  'job-a': {
    'fill-calls.jsonl': [...rows.map((row) => JSON.stringify(row)), '{malformed', 'null'].join('\n'),
    'RESULT.json': JSON.stringify({ as_of: '2026-10-27T13:00:00Z', results: rows.map(({ t, ...row }) => row) }),
    'metrics-broken.json': '{',
    'unknown.bin': 'gather_no_pages is not an artifact',
    'metrics-unknown.json': JSON.stringify({ unrelated: true }),
    'RECEIPT.md': 'gather_no_pages observed in prior run\ngather_no_pages observed again\n',
    'test-runner.log': '2026-10-27T14:00:00Z rowId=14 timeout\n2026-10-27T15:00:00Z rowId=14 timeout\n',
    'test-DONE': 'result source-ready abcdef\n',
    'test-GATE-FAIL.log': 'presented_fields_not_ok\n',
  },
  'job-b': { 'fill-calls.jsonl': rows.map((row) => JSON.stringify({ ...row, t: '2026-10-27T16:00:00Z' })).join('\n') },
};
export const negativeRows = [
  { t: at, rowId: 21, pageCount: 8, pagesAdded: 0, checkpoint: 'done', presented: true, trace: { gather: { path: 'reuse', gate: 'saved_pages' } } },
  { t: at, rowId: 22, type: 'flight', checkpoint: 'done', pageCount: 2 },
  { t: at, rowId: 23, type: 'car', checkpoint: 'done', pageCount: 2 },
  { t: at, rowId: 24, pageCount: 0, pagesAdded: 0, checkpoint: 'failed' },
  { t: '2026-10-20T12:00:00Z', rowId: 25, error: 'gather_no_pages' },
];
