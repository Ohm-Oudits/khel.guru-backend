import assert from "node:assert/strict";

import {
  minesMultiplier,
  minesSafeProbability,
  revealedGemsFromRound,
  settleMinesCashout,
  shuffleMinesFromFloats,
} from "../socket/modules/mines/mines.fairness.js";

assert.ok(
  Math.abs(minesMultiplier(3, 1) - 0.99 * (25 / 22)) < 1e-12,
  "First gem with 3 mines is 0.99 × 25/22 = 1.125x"
);

assert.ok(
  Math.abs(
    minesMultiplier(3, 2) - 0.99 * (25 / 22) * (24 / 21)
  ) < 1e-12,
  "Second gem multiplies by 24/21 once, not another 0.99"
);

const third = 0.99 * (25 / 22) * (24 / 21) * (23 / 20);
assert.ok(
  Math.abs(minesMultiplier(3, 3) - third) < 1e-12,
  "Third gem multiplies by 23/20"
);

const p5 = minesSafeProbability(3, 5);
assert.ok(Math.abs(p5 - 6840 / 13800) < 1e-12, "5-gem path probability with 3 mines");
assert.ok(
  Math.abs(minesMultiplier(3, 5) - 0.99 / p5) < 1e-12,
  "X_K = 0.99 / P_K applied once"
);
assert.ok(
  Math.abs(minesMultiplier(3, 5) - 2) < 0.01,
  "5 gems / 3 mines is about 2.00x"
);

assert.equal(minesMultiplier(3, 0), 1, "Cashout with 0 gems returns 1.00x stake");

const settled = settleMinesCashout({
  betAmount: 100,
  mineCount: 3,
  gemsRevealed: 1,
});
assert.ok(Math.abs(settled.payout - 112.5) < 1e-12);
assert.ok(Math.abs(settled.profit - 12.5) < 1e-12);
assert.ok(Math.abs(settled.multiplier - 1.125) < 1e-12);

const zeroStake = settleMinesCashout({
  betAmount: 0,
  mineCount: 3,
  gemsRevealed: 1,
});
assert.ok(
  Math.abs(zeroStake.multiplier - 1.125) < 1e-12,
  "Multiplier stays X_K even when stake is 0"
);

assert.equal(
  revealedGemsFromRound({ mines: 3, gems: 20, grid: [] }),
  2,
  "Revealed gems = (25-M) - remaining gems"
);

const floats = Array.from({ length: 24 }, (_, i) => (i + 1) / 25);
const mines = shuffleMinesFromFloats(floats, 3);
assert.equal(mines.length, 3);
assert.equal(new Set(mines).size, 3);
assert.deepEqual(
  mines,
  shuffleMinesFromFloats(floats, 3),
  "The same 24 floats replay the same mine indexes"
);
assert.ok(
  mines.every((index) => index >= 0 && index <= 24),
  "Mine indexes stay on the 25-tile board"
);

console.log("mines payout and fisher-yates tests passed");
