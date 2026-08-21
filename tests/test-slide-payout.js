import assert from "node:assert/strict";

import {
  deriveSlideMultiplier,
  SLIDE_RTP,
} from "../services/provablyFair.service.js";
import {
  settleSlideBet,
  slideWinChancePercent,
} from "../socket/modules/slide/slide.payout.js";

assert.equal(SLIDE_RTP, 0.98, "Slide is 98% RTP / 2% house edge");

assert.equal(
  deriveSlideMultiplier(0.25),
  Math.max(1, Math.floor((0.98 / 0.25) * 100) / 100),
  "Slide result is floor((0.98 / u) × 100) / 100"
);

assert.equal(
  Number(slideWinChancePercent(1.1).toFixed(2)),
  89.09,
  "1.10x target is 0.98/1.10 = 89.09%"
);
assert.equal(slideWinChancePercent(2), 49);
assert.equal(slideWinChancePercent(5), 19.6);
assert.equal(slideWinChancePercent(10), 9.8);
assert.equal(slideWinChancePercent(100), 0.98);

const win = settleSlideBet({
  betAmount: 100,
  targetMultiplier: 5,
  resultMultiplier: 5.01,
});
assert.equal(win.isWin, true);
assert.equal(win.payout, 500, "Win credits stake × target, not the generated result");

const loss = settleSlideBet({
  betAmount: 100,
  targetMultiplier: 5,
  resultMultiplier: 4.9,
});
assert.equal(loss.isWin, false);
assert.equal(loss.payout, 0, "Result below target keeps the debit");

const exact = settleSlideBet({
  betAmount: 100,
  targetMultiplier: 5,
  resultMultiplier: 5,
});
assert.equal(exact.isWin, true, "Result equal to target is a win");
assert.equal(exact.payout, 500);

console.log("slide payout tests passed");
