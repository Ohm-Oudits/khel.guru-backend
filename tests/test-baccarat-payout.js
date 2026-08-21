import assert from "node:assert/strict";

import { settleBaccaratBet } from "../socket/modules/baccarat/baccarat.payout.js";

assert.equal(settleBaccaratBet("player", "player", 100).payout, 200);
assert.equal(settleBaccaratBet("banker", "banker", 100).payout, 195);
assert.equal(settleBaccaratBet("tie", "tie", 100).payout, 900);

const playerPush = settleBaccaratBet("tie", "player", 100);
assert.equal(playerPush.status, "push");
assert.equal(playerPush.payout, 100);

const bankerPush = settleBaccaratBet("tie", "banker", 100);
assert.equal(bankerPush.status, "push");
assert.equal(bankerPush.payout, 100);

assert.equal(settleBaccaratBet("player", "banker", 100).status, "lost");
assert.equal(settleBaccaratBet("player", "tie", 100).payout, 0);
