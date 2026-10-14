#!/usr/bin/env node
import assert from 'node:assert/strict';

import { extractDetailFromSearchResults } from '../src/vacation/place-detail-extract.mjs';
import {
  buildCategoryDescription,
  isGenericDescription,
} from '../src/vacation/trip-thing-enrichment.mjs';
import { descriptionPassesDetailJudge } from '../src/vacation/thing-detail-fields.mjs';

const title = 'Blue Note Jazz Club';

const emptyEvent = buildCategoryDescription({
  category: 'event',
  title,
  sourceRecord: {},
  rawDescription: '',
});
assert.doesNotMatch(
  emptyEvent,
  /classic NYC|Live set with/i,
  'event fallback must not invent NYC venue copy',
);
assert.ok(emptyEvent.includes(title), 'event fallback names the thing');
assert.equal(isGenericDescription(emptyEvent), false, 'structured fallback is not generic placeholder');

const sourcedEvent = buildCategoryDescription({
  category: 'music',
  title,
  sourceRecord: {
    when: 'Sat 8:00 pm',
    summary:
      'Intimate room with table service and a set list that rotates weekly; arrive early for bar seats near the stage.',
  },
  rawDescription: '',
});
assert.match(sourcedEvent, /table service/i);
assert.match(sourcedEvent, /Sat 8:00 pm/i);

const thinSearch = extractDetailFromSearchResults({
  category: 'restaurant',
  title: 'Sample Midtown Bistro',
  website: 'https://example-bistro.test/',
  results: [
    {
      title: 'Overview',
      content:
        'This paragraph repeats neutral filler without naming the venue or citing sourced facts about the menu, room, or service style beyond generic praise and vague recommendations that could apply to any dining room in any city without specific dishes, prices, or neighborhood context.',
    },
  ],
});
const summary = String(thinSearch.summary || '');
assert.ok(summary.split(/\s+/).filter(Boolean).length >= 30, 'summary length unchanged');
assert.doesNotMatch(
  summary,
  /^Sample Midtown Bistro\s*—/i,
  'search summary must not prepend the title to game the detail judge',
);
assert.equal(descriptionPassesDetailJudge(summary, 'Sample Midtown Bistro'), true);

process.stdout.write('tsv397 integrity audit tests passed\n');
