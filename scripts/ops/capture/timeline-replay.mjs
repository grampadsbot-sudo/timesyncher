import { prepareFixtureReplaySharedTrip } from '../../../src/vacation/shared-trip-fixture-replay.mjs';

export function prepareTimelineReplay(bytes) {
  const { payload, timelineReplay } = prepareFixtureReplaySharedTrip(bytes);
  return { payload, timelineReplay };
}
