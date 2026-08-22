import assert from "node:assert/strict";

import {
  driftPrice,
  driftSelections,
} from "../services/liveOddsSim.service.js";

assert.equal(driftPrice(1.65, () => 1), 1.7);
assert.ok(driftPrice(151, () => 0) < 151);
assert.equal(driftPrice(null), null);

const { selections, changed } = driftSelections(
  [
    { key: "australia", name: "Australia", priceDecimal: 1.65, status: "open" },
    { key: "draw", name: "Draw", priceDecimal: 151, status: "open" },
  ],
  () => 1
);
assert.equal(changed, true);
assert.equal(selections[0].priceDecimal, 1.7);
assert.ok(selections[1].priceDecimal > 151);

console.log("live odds sim drift passed");
