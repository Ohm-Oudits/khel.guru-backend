import assert from "node:assert/strict";

import {
  oddsHashOf,
  oddsPayloadChanged,
  resetSportsbookOddsCache,
  setCachedOdds,
} from "../services/sportsbookOddsCache.service.js";
import {
  computeNextOddsSyncAt,
  dueOddsEventFilter,
  isTerminalSportsStatus,
} from "../services/sportsbookSyncSchedule.js";

const now = Date.parse("2026-08-22T12:00:00Z");

assert.equal(isTerminalSportsStatus({ status: "settled" }), true);
assert.equal(isTerminalSportsStatus({ status: "live" }), false);
assert.equal(computeNextOddsSyncAt({ status: "settled" }, now), null);

const liveNext = computeNextOddsSyncAt({ status: "live" }, now);
assert.equal(liveNext.getTime(), now + 20_000);

const soon = computeNextOddsSyncAt(
  { status: "upcoming", startTime: "2026-08-22T12:30:00Z" },
  now
);
assert.equal(soon.getTime(), now + 60_000);

const later = computeNextOddsSyncAt(
  { status: "upcoming", startTime: "2026-08-25T12:00:00Z" },
  now
);
assert.equal(later.getTime(), now + 45 * 60_000);

const immediate = computeNextOddsSyncAt(
  { status: "upcoming", startTime: "2026-08-25T12:00:00Z" },
  now,
  { immediate: true }
);
assert.equal(immediate.getTime(), now);

const filter = dueOddsEventFilter(new Date(now));
assert.deepEqual(filter.status.$in, ["live", "upcoming"]);
assert.equal(filter.provider, "odds-api-io");

await resetSportsbookOddsCache();
const payload = { eventId: "sched-101", bookmakers: { "1xbet": [{ name: "ML" }] } };
assert.equal(await oddsPayloadChanged("sched-101", payload), true);
await setCachedOdds("sched-101", payload);
assert.equal(await oddsPayloadChanged("sched-101", payload), false);
assert.equal(
  await oddsPayloadChanged("sched-101", {
    ...payload,
    bookmakers: { "1xbet": [{ name: "ML", odds: [{ home: "2.0" }] }] },
  }),
  true
);
assert.equal(oddsHashOf(payload), oddsHashOf({ ...payload }));

console.log("sportsbook odds scheduler passed");
