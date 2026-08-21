import assert from "node:assert/strict";

import {
  BIN_PAYOUTS,
  PLINKO_MAX_ROWS,
  PLINKO_MIN_ROWS,
  PLINKO_RTP,
  getPlinkoTable,
  plinkoSlotProbabilities,
  plinkoSlotProbability,
  plinkoTableRtp,
  settlePlinkoDrop,
} from "../socket/modules/plinko/plinko.payouts.js";

assert.equal(PLINKO_RTP, 0.99, "Plinko is 99% RTP / 1% house edge");

const eight = plinkoSlotProbabilities(8);
assert.equal(eight.length, 9);
assert.equal(Number((eight[0] * 100).toFixed(6)), 0.390625);
assert.equal(eight[1] * 100, 3.125);
assert.equal(eight[2] * 100, 10.9375);
assert.equal(eight[3] * 100, 21.875);
assert.equal(Number((eight[4] * 100).toFixed(5)), 27.34375);
assert.equal(plinkoSlotProbability(8, 8), plinkoSlotProbability(8, 0));

const naive = eight.reduce((sum, probability) => sum + 0.99 / probability, 0);
assert(
  naive > 8,
  "Per-slot 0.99/P(k) cannot be used: every slot pays, so the table must satisfy Σ P(k)M(k) = 0.99"
);

const maxes = {
  Easy: { 8: 5.6, 16: 16 },
  Medium: { 8: 13, 16: 110 },
  Hard: { 8: 29, 16: 1000 },
  Expert: { 8: 50, 16: 10000 },
};

for (let rows = PLINKO_MIN_ROWS; rows <= PLINKO_MAX_ROWS; rows += 1) {
  for (const risk of ["Easy", "Medium", "Hard", "Expert"]) {
    const table = getPlinkoTable(rows, risk);
    assert.equal(table.length, rows + 1, `${rows} ${risk} has n+1 slots`);
    assert.deepEqual(
      table,
      [...table].reverse(),
      `${rows} ${risk} is symmetric`
    );
    const rtp = plinkoTableRtp(rows, table);
    assert(
      rtp > 0.985 && rtp < 0.995,
      `${rows} ${risk} RTP ${rtp} should be ~0.99`
    );
  }
}

assert.equal(getPlinkoTable(16, "Easy")[0], maxes.Easy[16]);
assert.equal(getPlinkoTable(16, "Medium")[0], maxes.Medium[16]);
assert.equal(getPlinkoTable(16, "Hard")[0], maxes.Hard[16]);
assert.equal(getPlinkoTable(16, "Expert")[0], maxes.Expert[16]);
assert.equal(getPlinkoTable(8, "Low")[0], 5.6, "Low aliases Easy");
assert.equal(getPlinkoTable(8, "High")[0], 29, "High aliases Hard");
assert.equal(getPlinkoTable(16, "Expert")[8], 0.1, "Expert 16-row center is 0.1x");

const win = settlePlinkoDrop({
  betAmount: 100,
  rows: 8,
  risk: "Medium",
  bin: 0,
});
assert.equal(win.multiplier, 13);
assert.equal(win.payout, 1300);

const zero = settlePlinkoDrop({
  betAmount: 0,
  rows: 8,
  risk: "Medium",
  bin: 0,
});
assert.equal(zero.multiplier, 13, "Zero stake still resolves the slot multiplier");
assert.equal(zero.payout, 0);

assert.equal(Object.keys(BIN_PAYOUTS).length, 9);

console.log("plinko payout tests passed");
