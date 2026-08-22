import assert from "node:assert/strict";

import {
  evaluateLine,
  estimateSlotRtp,
  publicSlotConfig,
  resolveSlotSpin,
} from "../services/slotEngine.service.js";

assert.equal(evaluateLine(["ace", "ace", "fruit", "coin", "bar"]), null);
assert.equal(evaluateLine(["ace", "ace", "ace", "coin", "bar"]).count, 3);
assert.equal(evaluateLine(["ace", "ace", "ace", "coin", "bar"]).multiplier, 4);
assert.equal(evaluateLine(["seven", "wild", "seven", "seven", "bar"]).count, 4);
assert.equal(evaluateLine(["wild", "wild", "wild", "bar", "ace"]).symbol, "bar");
assert.equal(evaluateLine(["wild", "wild", "wild", "wild", "wild"]).symbol, "wild");

const known = resolveSlotSpin({
  slug: "neon-tiger",
  volatility: "medium",
  floats: [0, 0, 0, 0, 0],
  bet: 10,
});
assert.equal(known.grid.length, 3);
assert.equal(known.grid[0].length, 5);
assert.ok(known.grid[0][0].glyph);
assert.ok(known.grid[0][0].id);
assert.equal(typeof known.payout, "number");
assert.equal(known.stops.every((stop) => stop === 0), true);

const config = publicSlotConfig({ slug: "mango-rush" });
assert.equal(config.engine, "house");
assert.equal(config.playable, true);
assert.equal(config.icon, "🥭");
assert.equal(config.symbols.length, 8);

for (const volatility of ["low", "medium", "high"]) {
  const rtp = estimateSlotRtp({ volatility, spins: 8000, bet: 10 });
  assert(
    rtp > 0.85 && rtp < 1.08,
    `${volatility} RTP ${rtp} is outside the house sandbox band`
  );
}

console.log("slots engine evaluates lines, themed grids, and a sandbox RTP band");
