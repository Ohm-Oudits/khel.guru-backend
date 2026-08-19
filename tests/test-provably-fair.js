import assert from "node:assert/strict";

import {
  buildFairnessVerification,
  hashServerSeed,
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

console.log("Provably fair verification test passed");
