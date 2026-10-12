import assert from 'node:assert/strict';
import {
  TAB_ICONS,
  TAB_LABELS,
  TAB_ORDER,
  isTabId,
  isConfigSectionVisible,
  readTabFromLocation,
  tabLocationHash,
  visibleTabsForTrip,
} from '../src/lib/tabNavModel.mjs';

assert.deepEqual(TAB_ORDER, [
  'day-by-day',
  'flights',
  'hotels',
  'cars',
  'restaurants',
  'stores',
  'events',
  'budget',
]);

assert.equal(TAB_LABELS.events, 'The Rest');
assert.equal(TAB_ICONS.flights, '✈️');

assert.equal(readTabFromLocation('', ''), 'day-by-day');
assert.equal(readTabFromLocation('#tab=hotels', ''), 'hotels');
assert.equal(readTabFromLocation('', '?tab=cars'), 'cars');
assert.equal(readTabFromLocation('#budget', ''), 'budget');
assert.equal(readTabFromLocation('#tab=not-a-tab', ''), 'day-by-day');

assert.equal(tabLocationHash('day-by-day'), '');
assert.equal(tabLocationHash('restaurants'), '#tab=restaurants');

assert.equal(isTabId('stores'), true);
assert.equal(isTabId('nope'), false);

assert.equal(isConfigSectionVisible(undefined, 'flights'), true);
assert.equal(
  isConfigSectionVisible({ thingOverrides: { __sectionVisibility: { hotels: false } } }, 'hotels'),
  false,
);

const baseTrip = {
  thingOverrides: { __sectionVisibility: { cars: false } },
  permissions: { share_budget: true, share_packing: true, share_collab: true },
};
const visible = visibleTabsForTrip(baseTrip, baseTrip.permissions);
assert.ok(!visible.includes('cars'));
assert.ok(visible.includes('packing'));
assert.ok(visible.includes('chat'));
assert.ok(visible.includes('budget'));

await import('./listRows.unit.mjs');

console.log('vacation-client TabNav unit checks passed');
