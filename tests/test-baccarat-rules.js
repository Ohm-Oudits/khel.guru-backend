import assert from "node:assert/strict";

import {
  applyBaccaratThirdCards,
  baccaratScore,
  shouldBankerDrawThird,
  shouldPlayerDrawThird,
} from "../socket/modules/baccarat/baccarat.rules.js";

const card = (value) => ({ value, suit: "♠" });
const takeFrom = (values) => {
  const queue = values.map(card);
  return () => queue.shift();
};

assert.equal(shouldPlayerDrawThird(0), true);
assert.equal(shouldPlayerDrawThird(5), true);
assert.equal(shouldPlayerDrawThird(6), false);
assert.equal(shouldPlayerDrawThird(7), false);
assert.equal(shouldPlayerDrawThird(8), false);
assert.equal(shouldPlayerDrawThird(9), false);

assert.equal(
  shouldBankerDrawThird({
    bankerTwoCardScore: 5,
    playerDrew: false,
  }),
  true
);
assert.equal(
  shouldBankerDrawThird({
    bankerTwoCardScore: 6,
    playerDrew: false,
  }),
  false
);

assert.equal(
  shouldBankerDrawThird({
    bankerTwoCardScore: 5,
    playerDrew: true,
    playerThirdPoint: 7,
  }),
  true
);
assert.equal(
  shouldBankerDrawThird({
    bankerTwoCardScore: 5,
    playerDrew: true,
    playerThirdPoint: 3,
  }),
  false
);
assert.equal(
  shouldBankerDrawThird({
    bankerTwoCardScore: 3,
    playerDrew: true,
    playerThirdPoint: 8,
  }),
  false
);
assert.equal(
  shouldBankerDrawThird({
    bankerTwoCardScore: 6,
    playerDrew: true,
    playerThirdPoint: 6,
  }),
  true
);
assert.equal(
  shouldBankerDrawThird({
    bankerTwoCardScore: 7,
    playerDrew: true,
    playerThirdPoint: 7,
  }),
  false
);

const natural = applyBaccaratThirdCards(
  [card("9"), card("K")],
  [card("5"), card("A")],
  takeFrom(["7"])
);
assert.equal(natural.playerCards.length, 2);
assert.equal(natural.bankerCards.length, 2);
assert.equal(baccaratScore(natural.playerCards), 9);

const example = applyBaccaratThirdCards(
  [card("4"), card("K")],
  [card("5"), card("K")],
  takeFrom(["7", "2"])
);
assert.equal(example.playerCards.length, 3);
assert.equal(example.playerCards[2].value, "7");
assert.equal(example.bankerCards.length, 3);
assert.equal(baccaratScore(example.playerCards), 1);
assert.equal(baccaratScore(example.bankerCards), 7);
