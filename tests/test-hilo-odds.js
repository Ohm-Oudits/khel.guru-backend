import assert from "node:assert/strict";

import {
  applyPickMultiplier,
  getHiloOdds,
  pickFactor,
} from "../socket/modules/hilo/hilo.odds.js";

const chain = (picks) => {
  let multiplier = 1;
  for (const [value, direction] of picks) {
    const odds = getHiloOdds(value);
    const chance = direction === "high" ? odds.high.chance : odds.low.chance;
    multiplier = applyPickMultiplier(multiplier, pickFactor(chance));
  }
  return Number(multiplier.toFixed(3));
};

const twoHigh = getHiloOdds("2").high.multiplier;
assert.equal(twoHigh, 1.0725, "Higher on a 2 is 0.99 / (12/13) = 1.0725");

const seven = getHiloOdds("7");
assert.equal(seven.high.multiplier, seven.low.multiplier);
assert.equal(seven.high.percent, 53.85);

assert.equal(
  chain([
    ["2", "high"],
    ["3", "low"],
  ]),
  4.601,
  "2 higher then 3 lower compounds 0.99/P on every pick"
);

assert.equal(
  chain([
    ["7", "high"],
    ["7", "low"],
  ]),
  3.38,
  "7 higher then 7 lower"
);

assert.equal(
  chain([
    ["2", "low"],
    ["2", "low"],
  ]),
  41.409,
  "2 lower then 2 lower"
);
