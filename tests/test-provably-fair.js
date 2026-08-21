import assert from "node:assert/strict";

import {
  buildFairnessVerification,
  deriveKenoHits,
  deriveOutcomeIndex,
  deriveRoulettePocket,
  drawKenoHitsFromFloats,
  hashServerSeed,
  KENO_EVENT_COUNT,
  ROULETTE_FAIRNESS_FORMULA,
  takeFairnessFloats,
} from "../services/provablyFair.service.js";

const verification = buildFairnessVerification({
  gameKey: "dice",
  serverSeed: "server-seed-demo",
  clientSeed: "client-seed-demo",
  nonce: 12,
  cursor: 0,
});

assert.equal(
  verification.serverSeedHash,
  hashServerSeed("server-seed-demo"),
  "Expected verification to expose the correct server seed hash"
);
assert.equal(
  verification.digest.length,
  64,
  "Expected fairness digest to be a SHA-256 hex string"
);
assert(
  verification.normalizedRoll >= 0 && verification.normalizedRoll <= 1,
  "Normalized roll should stay within 0 and 1"
);
assert(
  verification.result >= 0 && verification.result <= 100,
  "Dice result should stay within 0 and 100"
);
assert.equal(
  verification.result,
  Math.floor(verification.normalizedRoll * 10001) / 100,
  "Dice must use Stake floor(float * 10001) / 100"
);
assert(
  String(verification.formula || "").includes("10001"),
  "Dice verification should publish the 10,001-bucket formula"
);

const limboVerification = buildFairnessVerification({
  gameKey: "limbo",
  serverSeed: "server-seed-demo",
  clientSeed: "client-seed-demo",
  nonce: 12,
  cursor: 0,
});

assert(
  limboVerification.result >= 1,
  "Multiplier-style fairness results should never dip below 1x"
);
assert.equal(
  limboVerification.result,
  Math.max(1, Math.floor((0.99 / limboVerification.normalizedRoll) * 100) / 100),
  "Limbo must use Stake floor((0.99 / float) * 100) / 100"
);

const pumpVerification = buildFairnessVerification({
  gameKey: "pump",
  serverSeed: "server-seed-demo",
  clientSeed: "client-seed-demo",
  nonce: 12,
  cursor: 0,
});
assert.equal(
  pumpVerification.result,
  limboVerification.result,
  "Pump Low (default) must use Limbo's 0.99 / u pop-point curve"
);

const pumpMedium = buildFairnessVerification({
  gameKey: "pump",
  serverSeed: "server-seed-demo",
  clientSeed: "client-seed-demo",
  nonce: 12,
  risk: "Medium",
});
assert.equal(
  pumpMedium.result,
  Math.max(1, Math.floor((0.8 / pumpMedium.normalizedRoll) * 100) / 100),
  "Pump Medium must use 0.80 / u"
);

const pumpHigh = buildFairnessVerification({
  gameKey: "pump",
  serverSeed: "server-seed-demo",
  clientSeed: "client-seed-demo",
  nonce: 12,
  risk: "High",
});
assert.equal(
  pumpHigh.result,
  Math.max(1, Math.floor((0.5 / pumpHigh.normalizedRoll) * 100) / 100),
  "Pump High must use 0.50 / u"
);
assert(
  pumpHigh.result <= pumpMedium.result &&
    pumpMedium.result <= pumpVerification.result,
  "Higher pump risk must not raise the pop point for the same seed"
);

const parachuteMedium = buildFairnessVerification({
  gameKey: "parachute",
  serverSeed: "server-seed-demo",
  clientSeed: "client-seed-demo",
  nonce: 12,
  difficulty: "medium",
});
assert.equal(
  parachuteMedium.result,
  pumpMedium.result,
  "Parachute medium must share Pump Medium's 0.80 / u curve"
);

const parachuteHigh = buildFairnessVerification({
  gameKey: "parachute",
  serverSeed: "server-seed-demo",
  clientSeed: "client-seed-demo",
  nonce: 12,
  difficulty: "high",
});
assert.equal(
  parachuteHigh.result,
  pumpHigh.result,
  "Parachute high must share Pump High's 0.50 / u curve"
);

const plinkoVerification = buildFairnessVerification({
  gameKey: "plinko",
  serverSeed: "server-seed-demo",
  clientSeed: "client-seed-demo",
  nonce: 12,
  rows: 12,
});
assert.equal(
  plinkoVerification.path.length,
  12,
  "Plinko path should have one left/right step per row"
);
assert(
  plinkoVerification.result >= 0 && plinkoVerification.result <= 12,
  "Plinko bin should stay within the row count"
);

const plinkoAgain = buildFairnessVerification({
  gameKey: "plinko",
  serverSeed: "server-seed-demo",
  clientSeed: "client-seed-demo",
  nonce: 12,
  rows: 12,
});
assert.equal(
  plinkoVerification.result,
  plinkoAgain.result,
  "The same seeds and nonce must replay the same plinko bin"
);

const plinkoFloats = buildFairnessVerification({
  gameKey: "plinko",
  serverSeed: "some server seed",
  clientSeed: "some client seed",
  nonce: 1,
  rows: 8,
});
assert.equal(
  plinkoFloats.path.length,
  8,
  "An 8-row board must produce 8 left/right steps"
);
assert.deepEqual(
  plinkoFloats.path.map((step) => (step ? "R" : "L")),
  ["R", "R", "L", "L", "R", "R", "R", "L"],
  "Plinko path must match the Stake HMAC 4-byte cursor stream"
);

const crashVerification = buildFairnessVerification({
  gameKey: "crash",
  serverSeed: "server-seed-demo",
  clientSeed: "client-seed-demo",
  nonce: 11,
});
assert.equal(
  crashVerification.result,
  Math.max(
    1,
    Math.floor((2 ** 32 / (crashVerification.n + 1)) * 0.99 * 100) / 100
  ),
  "Crash uses Stake max(1, floor((2^32/(N+1))*rtp*100)/100) with published rtp"
);
assert.equal(crashVerification.rtpPercent, 99);

const crashEvenNonceStillBase = buildFairnessVerification({
  gameKey: "crash",
  serverSeed: "server-seed-demo",
  clientSeed: "client-seed-demo",
  nonce: 12,
});
assert.equal(
  crashEvenNonceStillBase.rtpPercent,
  99,
  "Nonce parity no longer chooses RTP; alt must be passed to verify"
);

const crashAltVerification = buildFairnessVerification({
  gameKey: "crash",
  serverSeed: "server-seed-demo",
  clientSeed: "client-seed-demo",
  nonce: 12,
  alt: true,
});
assert.ok(
  [40, 50, 60, 70, 80, 90].includes(crashAltVerification.rtpPercent),
  "Alt crash rounds HMAC-pick RTP from [40, 50, 60, 70, 80, 90]"
);
assert.equal(
  crashAltVerification.result,
  Math.max(
    1,
    Math.floor(
      (2 ** 32 / (crashAltVerification.n + 1)) *
        crashAltVerification.rtp *
        100
    ) / 100
  ),
  "Alt crash rounds apply the HMAC-picked RTP to the Stake N formula"
);
assert.equal(
  crashVerification.n,
  Number.parseInt(crashVerification.digest.slice(0, 8), 16),
  "Crash N is parseInt of the first 8 HMAC hex digits"
);

const slideVerification = buildFairnessVerification({
  gameKey: "slide",
  serverSeed: "server-seed-demo",
  clientSeed: "client-seed-demo",
  nonce: 12,
});
assert.equal(
  slideVerification.result,
  Math.max(1, Math.floor((0.98 / slideVerification.normalizedRoll) * 100) / 100),
  "Slide must use Stake floor((0.98 / float) * 100) / 100"
);
assert.notEqual(
  slideVerification.result,
  limboVerification.result,
  "Slide 98% RTP must not reuse Limbo's 0.99/float curve"
);

const wheelVerification = buildFairnessVerification({
  gameKey: "wheel",
  serverSeed: "server-seed-demo",
  clientSeed: "client-seed-demo",
  nonce: 12,
  length: 10,
});
assert.equal(
  wheelVerification.result,
  deriveOutcomeIndex(wheelVerification.normalizedRoll, 10),
  "Wheel index must be floor(float * list.length)"
);
assert(
  wheelVerification.result >= 0 && wheelVerification.result < 10,
  "Wheel index must stay inside the table"
);
assert(
  String(wheelVerification.formula || "").includes("segments"),
  "Wheel verification should publish the segment-index formula"
);

const rouletteVerification = buildFairnessVerification({
  gameKey: "roulette",
  serverSeed: "server-seed-demo",
  clientSeed: "client-seed-demo",
  nonce: 12,
});
assert.equal(
  rouletteVerification.result,
  deriveRoulettePocket(rouletteVerification.normalizedRoll),
  "Roulette must use Stake floor(float × 37)"
);
assert.equal(
  rouletteVerification.formula,
  ROULETTE_FAIRNESS_FORMULA,
  "Roulette verification should document the Stake formula"
);
assert(
  rouletteVerification.result >= 0 && rouletteVerification.result <= 36,
  "Roulette pocket must stay within 0 and 36"
);

const rouletteReplay = buildFairnessVerification({
  gameKey: "roulette",
  serverSeed: "server-seed-demo",
  clientSeed: "client-seed-demo",
  nonce: 12,
});
assert.equal(
  rouletteVerification.result,
  rouletteReplay.result,
  "The same seeds and nonce must replay the same roulette pocket"
);

const [stakeFloat] = takeFairnessFloats({
  serverSeed: "2c9ff80273373a0110fa3c883d22c99a66e4d55e8ed8deb9db75ad88b70b73d2",
  clientSeed: "d446e7cd361065de",
  nonce: 0,
  count: 1,
});
assert.equal(
  deriveRoulettePocket(stakeFloat),
  28,
  "Sample Stake-style HMAC stream should derive pocket 28 for demo seeds"
);

const minesVerification = buildFairnessVerification({
  gameKey: "mines",
  serverSeed: "server-seed-demo",
  clientSeed: "client-seed-demo",
  nonce: 12,
  mineCount: 3,
});
assert.equal(minesVerification.result.length, 3, "Mines layout has mineCount tiles");
assert.equal(
  new Set(minesVerification.result).size,
  3,
  "Mine tiles must be unique"
);

const minesAgain = buildFairnessVerification({
  gameKey: "mines",
  serverSeed: "server-seed-demo",
  clientSeed: "client-seed-demo",
  nonce: 12,
  mineCount: 3,
});
assert.deepEqual(
  minesVerification.result,
  minesAgain.result,
  "The same seeds and nonce must replay the same mine layout"
);
assert.equal(
  minesVerification.formula.includes("Fisher-Yates"),
  true,
  "Mines verification publishes the Fisher-Yates layout formula"
);
assert.equal(minesVerification.count, 24, "Mines always consume 24 HMAC floats");

const towerVerification = buildFairnessVerification({
  gameKey: "tower",
  serverSeed: "server-seed-demo",
  clientSeed: "client-seed-demo",
  nonce: 12,
  difficulty: "easy",
});
assert.equal(towerVerification.rows, 9, "Tower layout should have 9 levels");
assert.equal(towerVerification.cols, 4, "Easy tower should have 4 tiles per level");
assert.equal(
  towerVerification.eggLevels.length,
  9,
  "Tower should expose 9 egg level arrays"
);
assert.equal(
  towerVerification.eggLevels[0].length,
  3,
  "Easy level should place 3 eggs"
);
assert.equal(
  towerVerification.result.length,
  9,
  "Verification result should list egg indices per level"
);

const mediumTower = buildFairnessVerification({
  gameKey: "tower",
  serverSeed: "server-seed-demo",
  clientSeed: "client-seed-demo",
  nonce: 12,
  difficulty: "medium",
});
assert.equal(mediumTower.cols, 3, "Medium tower should have 3 tiles per level");
assert.equal(mediumTower.eggLevels[0].length, 2, "Medium level should place 2 eggs");

const towerAgain = buildFairnessVerification({
  gameKey: "tower",
  serverSeed: "server-seed-demo",
  clientSeed: "client-seed-demo",
  nonce: 12,
  difficulty: "easy",
});
assert.deepEqual(
  towerVerification.eggLevels,
  towerAgain.eggLevels,
  "The same seeds and nonce must replay the same egg levels"
);

const hardTower = buildFairnessVerification({
  gameKey: "tower",
  serverSeed: "server-seed-demo",
  clientSeed: "client-seed-demo",
  nonce: 12,
  difficulty: "hard",
});
assert.notDeepEqual(
  towerVerification.eggLevels,
  hardTower.eggLevels,
  "Different difficulties must produce different egg layouts"
);
assert.equal(hardTower.maxMultiplier, 3, "Hard tower max multiplier should be 3");
assert.equal(
  hardTower.floatCount,
  9,
  "Hard tower should consume one float per row"
);
assert.ok(hardTower.payoutFormulas.checkout.includes("progress"));

import {
  computeTowerCheckoutProfit,
  computeTowerWinProfit,
  getTowerProgress,
} from "../socket/modules/tower/tower.payout.js";

assert.equal(getTowerProgress({ currentRow: 8, rows: 9 }), 0);
assert.equal(getTowerProgress({ currentRow: 7, rows: 9 }), 1);
assert.equal(
  computeTowerCheckoutProfit({
    difficulty: "Easy",
    betAmount: 100,
    currentRow: 7,
    rows: 9,
  }),
  100 * 1.5 * (1 / 9)
);
assert.equal(
  computeTowerWinProfit({ difficulty: "Easy", betAmount: 100 }),
  150
);

const twistVerification = buildFairnessVerification({
  gameKey: "twist",
  serverSeed: "server-seed-demo",
  clientSeed: "client-seed-demo",
  nonce: 12,
});
assert.equal(
  ["green", "orange", "purple", "null", "skull"].includes(twistVerification.result),
  true,
  "Twist verification must map the HMAC float onto a published outcome"
);
assert.equal(
  twistVerification.outcome,
  twistVerification.result,
  "Twist result and outcome fields must match"
);
assert.equal(
  twistVerification.table.length,
  5,
  "Twist must publish the five-bucket outcome table"
);

const twistAgain = buildFairnessVerification({
  gameKey: "twist",
  serverSeed: "server-seed-demo",
  clientSeed: "client-seed-demo",
  nonce: 12,
});
assert.equal(
  twistVerification.result,
  twistAgain.result,
  "The same seeds and nonce must replay the same Twist outcome"
);

import { deriveTwistOutcome } from "../socket/modules/twist/twist.fairness.js";
import {
  applyTwistOutcome,
  boardMultiplier,
  computeBoardPayout,
  reduceBoardProgress,
} from "../socket/modules/twist/twist.payout.js";

assert.equal(deriveTwistOutcome(0), "green");
assert.equal(deriveTwistOutcome(0.249999), "green");
assert.equal(deriveTwistOutcome(0.25), "orange");
assert.equal(deriveTwistOutcome(0.45), "purple");
assert.equal(deriveTwistOutcome(0.6), "null");
assert.equal(deriveTwistOutcome(0.75), "skull");
assert.deepEqual(applyTwistOutcome({ green: 0, orange: 0, purple: 0 }, "green"), {
  green: 1,
  orange: 0,
  purple: 0,
});
assert.deepEqual(applyTwistOutcome({ green: 2, orange: 1, purple: 3 }, "skull"), {
  green: 1,
  orange: 0,
  purple: 2,
});
assert.equal(boardMultiplier({ green: 1, orange: 0, purple: 0 }), 1.55);
assert.equal(computeBoardPayout(10, { green: 1, orange: 0, purple: 0 }), 15.5);
assert.deepEqual(reduceBoardProgress({ green: 2, orange: 1, purple: 0 }), {
  green: 1,
  orange: 0,
  purple: 0,
});

import {
  BACCARAT_EVENT_COUNT,
  HILO_BLACKJACK_EVENT_COUNT,
  STAKE_CARDS,
  baccaratDealtFromHands,
  blackjackDealtFromState,
  cardFromFloat,
  cardIndexFromFloat,
  cardsFromFloats,
  hiloDealtFromHistory,
} from "../services/cardFairness.js";

assert.equal(STAKE_CARDS.length, 52);
assert.equal(STAKE_CARDS[0].label, "♦2");
assert.equal(STAKE_CARDS[1].label, "♥2");
assert.equal(STAKE_CARDS[2].label, "♠2");
assert.equal(STAKE_CARDS[3].label, "♣2");
assert.equal(STAKE_CARDS[51].label, "♣A");
assert.equal(cardIndexFromFloat(0), 0);
assert.equal(cardFromFloat(0).label, "♦2");
assert.equal(cardIndexFromFloat(0.999), 51);

const hiloCards = buildFairnessVerification({
  gameKey: "hilo",
  serverSeed: "server-seed-demo",
  clientSeed: "client-seed-demo",
  nonce: 12,
});
assert.equal(hiloCards.count, HILO_BLACKJACK_EVENT_COUNT);
assert.equal(hiloCards.result.length, 52);
assert.equal(hiloCards.hmacRounds, 7);
assert.equal(
  hiloCards.result[0],
  cardFromFloat(hiloCards.normalizedRoll).label
);

const hiloAgain = buildFairnessVerification({
  gameKey: "hilo",
  serverSeed: "server-seed-demo",
  clientSeed: "client-seed-demo",
  nonce: 12,
});
assert.deepEqual(hiloCards.result, hiloAgain.result);

const blackjackCards = buildFairnessVerification({
  gameKey: "blackjack",
  serverSeed: "server-seed-demo",
  clientSeed: "client-seed-demo",
  nonce: 12,
});
assert.deepEqual(blackjackCards.result, hiloCards.result);

const baccaratCards = buildFairnessVerification({
  gameKey: "baccarat",
  serverSeed: "server-seed-demo",
  clientSeed: "client-seed-demo",
  nonce: 12,
});
assert.equal(baccaratCards.count, BACCARAT_EVENT_COUNT);
assert.equal(baccaratCards.result.length, 6);
assert.deepEqual(
  baccaratCards.result,
  hiloCards.result.slice(0, 6),
  "Baccarat's 6 events are the prefix of the same HMAC stream"
);

assert.deepEqual(
  baccaratDealtFromHands(
    [
      { suit: "♦", value: "2" },
      { suit: "♥", value: "3" },
    ],
    [
      { suit: "♠", value: "4" },
      { suit: "♣", value: "5" },
      { suit: "♦", value: "6" },
    ]
  ),
  [
    { index: 0, label: "♦2" },
    { index: 1, label: "♥3" },
    { index: 2, label: "♠4" },
    { index: 3, label: "♣5" },
    { index: 4, label: "♦6" },
  ],
  "Baccarat HMAC order is player 2, banker 2, then extras as drawn"
);

assert.deepEqual(
  hiloDealtFromHistory([
    { suit: "♦", value: "2" },
    { suit: "♣", value: "A" },
  ]),
  [
    { index: 0, label: "♦2" },
    { index: 1, label: "♣A" },
  ]
);

assert.deepEqual(
  blackjackDealtFromState({
    userCards: [
      { suit: "♦", value: "A", id: "♦-A-0" },
      { suit: "♠", value: "K", id: "♠-K-1" },
    ],
    dealerCards: [
      { suit: "♥", value: "7", id: "♥-7-2" },
      { suit: "hidden", value: "hidden", hidden: true, id: "dealer-hole" },
    ],
  }),
  [
    { index: 0, label: "♦A" },
    { index: 1, label: "♠K" },
    { index: 2, label: "♥7" },
  ],
  "Blackjack fairness must omit the hidden hole card"
);

const mapped = cardsFromFloats([0, 1 / 52, 51 / 52]);
assert.equal(mapped[0].label, "♦2");
assert.equal(mapped[1].label, "♥2");

const shrinkingHits = drawKenoHitsFromFloats([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
assert.deepEqual(
  shrinkingHits,
  [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  "Zero floats must take the first remaining square each time"
);

const lastSquareHits = drawKenoHitsFromFloats([
  0.999999,
  0.999999,
  0.999999,
  0.999999,
  0.999999,
  0.999999,
  0.999999,
  0.999999,
  0.999999,
  0.999999,
]);
assert.deepEqual(
  lastSquareHits,
  [40, 39, 38, 37, 36, 35, 34, 33, 32, 31],
  "Near-1 floats must take the last remaining square each time"
);
assert.equal(new Set(lastSquareHits).size, 10, "Keno hits must be unique");
assert(
  lastSquareHits.every((hit) => hit >= 1 && hit <= 40),
  "Keno hits live on squares 1–40"
);

const kenoVerification = buildFairnessVerification({
  gameKey: "keno",
  serverSeed: "server-seed-demo",
  clientSeed: "client-seed-demo",
  nonce: 12,
});
assert.equal(kenoVerification.count, KENO_EVENT_COUNT);
assert.equal(kenoVerification.result.length, 10);
assert.equal(new Set(kenoVerification.result).size, 10);
assert.deepEqual(
  kenoVerification.result,
  deriveKenoHits({
    serverSeed: "server-seed-demo",
    clientSeed: "client-seed-demo",
    nonce: 12,
  })
);

const kenoAgain = buildFairnessVerification({
  gameKey: "keno",
  serverSeed: "server-seed-demo",
  clientSeed: "client-seed-demo",
  nonce: 12,
});
assert.deepEqual(
  kenoVerification.result,
  kenoAgain.result,
  "The same seeds and nonce must replay the same keno hits"
);

const scratchVerification = buildFairnessVerification({
  gameKey: "scratch",
  serverSeed: "server-seed-demo",
  clientSeed: "client-seed-demo",
  nonce: 12,
});
assert.equal(scratchVerification.diamonds.length, 9);
assert.equal(scratchVerification.balloons.length, 9);
assert.ok(
  scratchVerification.diamonds.every((color) =>
    ["red", "blue", "green", "yellow", "purple"].includes(color)
  ),
  "Scratch diamonds must come from the published 5-color palette"
);
assert.deepEqual(
  scratchVerification.result,
  scratchVerification.diamonds,
  "Scratch verify result is the 9 diamond colors"
);

const scratchAgain = buildFairnessVerification({
  gameKey: "scratch",
  serverSeed: "server-seed-demo",
  clientSeed: "client-seed-demo",
  nonce: 12,
});
assert.deepEqual(
  scratchVerification.diamonds,
  scratchAgain.diamonds,
  "The same seeds and nonce must replay the same scratch grid"
);

console.log("Provably fair verification test passed");
