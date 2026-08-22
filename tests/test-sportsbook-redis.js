import assert from "node:assert/strict";

process.env.REDIS_URL =
  process.env.REDIS_URL || "redis://127.0.0.1:6379";

const {
  getCachedOdds,
  oddsPayloadChanged,
  pingSportsbookCache,
  resetSportsbookOddsCache,
  setCachedOdds,
} = await import("../services/sportsbookOddsCache.service.js");

await resetSportsbookOddsCache();
const ping = await pingSportsbookCache();
assert.equal(ping.backend, "redis", "Redis must be running at REDIS_URL");
assert.equal(String(ping.pong).toUpperCase(), "PONG");

const payload = {
  eventId: "redis-test-1",
  bookmakers: { "1xbet": [{ name: "ML", odds: [{ home: "1.90" }] }] },
};
assert.equal(await oddsPayloadChanged("redis-test-1", payload), true);
await setCachedOdds("redis-test-1", payload);
const cached = await getCachedOdds("redis-test-1");
assert.equal(cached.eventId, "redis-test-1");
assert.equal(await oddsPayloadChanged("redis-test-1", payload), false);
await resetSportsbookOddsCache();

console.log("sportsbook Redis cache passed");
