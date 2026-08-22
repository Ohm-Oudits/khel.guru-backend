import assert from "node:assert/strict";
import { resolveLiveRound } from "../services/liveEngine.service.js";

const red = resolveLiveRound({
  tableType: "roulette",
  selection: "red",
  floats: [1 / 37, 0],
  bet: 10,
});
assert.equal(red.result.pocket, 1);
assert.equal(red.result.color, "red");
assert.equal(red.payout, 20);

const zero = resolveLiveRound({
  tableType: "roulette",
  selection: "red",
  floats: [0, 0],
  bet: 10,
});
assert.equal(zero.result.pocket, 0);
assert.equal(zero.payout, 0);

const bj = resolveLiveRound({
  tableType: "blackjack",
  selection: "",
  floats: [0.9, 0.1],
  bet: 10,
});
assert.ok(bj.result.player >= 12);
assert.ok(bj.result.dealer >= 12);

console.log("live engine settles roulette and blackjack rounds without originals");
