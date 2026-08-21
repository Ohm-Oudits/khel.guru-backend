import assert from "node:assert/strict";

import {
  BJ_INSURANCE_WIN_RETURN,
  BJ_LOSE_RETURN,
  BJ_NATURAL_RETURN,
  BJ_PUSH_RETURN,
  BJ_WIN_RETURN,
  compareHands,
  isNaturalBlackjack,
  settleInsurance,
  settleMainHand,
} from "../socket/modules/blackjack/blackjack.payout.js";

assert.equal(isNaturalBlackjack([{ value: "A" }, { value: "K" }]), true);
assert.equal(isNaturalBlackjack([{ value: "A" }, { value: "10" }]), true);
assert.equal(isNaturalBlackjack([{ value: "A" }, { value: "9" }]), false);
assert.equal(
  isNaturalBlackjack([{ value: "A" }, { value: "10" }, { value: "K" }]),
  false
);

assert.equal(settleMainHand({ stake: 100, result: "win" }).totalReturn, 200);
assert.equal(settleMainHand({ stake: 100, result: "win" }).multiplier, BJ_WIN_RETURN);
assert.equal(
  settleMainHand({ stake: 100, result: "blackjack" }).totalReturn,
  250
);
assert.equal(
  settleMainHand({
    stake: 100,
    result: "win",
    playerNatural: true,
  }).totalReturn,
  250
);
assert.equal(
  settleMainHand({
    stake: 100,
    result: "win",
    playerNatural: true,
    splitHand: true,
  }).totalReturn,
  200
);
assert.equal(settleMainHand({ stake: 100, result: "draw" }).totalReturn, 100);
assert.equal(settleMainHand({ stake: 100, result: "lose" }).totalReturn, 0);
assert.equal(
  settleMainHand({ stake: 200, result: "win" }).totalReturn,
  400
);

assert.equal(
  settleInsurance({ insuranceStake: 50, dealerNatural: true }).totalReturn,
  150
);
assert.equal(
  settleInsurance({ insuranceStake: 50, dealerNatural: false }).totalReturn,
  0
);

assert.equal(compareHands(20, 19), "win");
assert.equal(compareHands(18, 18), "draw");
assert.equal(compareHands(17, 19), "lose");
assert.equal(compareHands(22, 17), "lose");
assert.equal(compareHands(18, 22), "win");

assert.equal(BJ_NATURAL_RETURN, 2.5);
assert.equal(BJ_WIN_RETURN, 2);
assert.equal(BJ_PUSH_RETURN, 1);
assert.equal(BJ_LOSE_RETURN, 0);
assert.equal(BJ_INSURANCE_WIN_RETURN, 3);

console.log("blackjack payouts ok");
