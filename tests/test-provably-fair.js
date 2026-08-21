import assert from "node:assert/strict";

import {
  buildFairnessVerification,
  deriveOutcomeIndex,
  deriveRoulettePocket,
  hashServerSeed,
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
  nonce: 12,
});
assert.equal(
  crashVerification.result,
  limboVerification.result,
  "Crash uses the same Stake 0.99/float multiplier as limbo"
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
  "floor(float × 37)",
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

console.log("Provably fair verification test passed");
