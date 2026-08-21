import assert from "node:assert/strict";

import {
  CRASH_RTP,
  deriveFairnessDigest,
  deriveStakeCrashPoint,
  hashServerSeed,
  hmacInteger32FromBytes,
  takeFairnessBytes,
} from "../services/provablyFair.service.js";
import {
  crashCashoutPayout,
  crashReachChancePercent,
} from "../socket/modules/crash/crash.payout.js";
import {
  commitCrashRound,
  publicCrashFairness,
} from "../socket/modules/crash/crash.fairness.js";

assert.equal(CRASH_RTP, 0.99, "Crash is 99% RTP / 1% house edge");

assert.equal(Number(crashReachChancePercent(1.1).toFixed(1)), 90);
assert.equal(Number(crashReachChancePercent(1.5).toFixed(1)), 66);
assert.equal(Number(crashReachChancePercent(2).toFixed(1)), 49.5);
assert.equal(Number(crashReachChancePercent(3).toFixed(1)), 33);
assert.equal(Number(crashReachChancePercent(5).toFixed(1)), 19.8);
assert.equal(Number(crashReachChancePercent(10).toFixed(1)), 9.9);
assert.equal(Number(crashReachChancePercent(100).toFixed(2)), 0.99);
assert.equal(Number(crashReachChancePercent(1000).toFixed(3)), 0.099);

assert.equal(
  crashCashoutPayout(100, 3),
  300,
  "Cashout at 3x credits stake × 3, not the crash point"
);

assert.equal(
  deriveStakeCrashPoint(0xffffffff),
  1,
  "Largest N yields C = max(1, 0.99) = 1.00x"
);
assert.equal(
  deriveStakeCrashPoint(0),
  Math.max(1, Math.floor(((2 ** 32 / 1) * 0.99) * 100) / 100)
);

const seeds = {
  serverSeed: "server-seed-demo",
  clientSeed: "client-seed-demo",
  nonce: 12,
};
const digest = deriveFairnessDigest({ ...seeds, cursor: 0 });
const bytes = takeFairnessBytes({ ...seeds, count: 4 });
const n = hmacInteger32FromBytes(bytes);
assert.equal(
  n,
  Number.parseInt(digest.slice(0, 8), 16),
  "N is the first 8 HMAC hex digits (first 4 stream bytes)"
);
assert.equal(
  deriveStakeCrashPoint(n),
  Math.max(1, Math.floor((2 ** 32 / (n + 1)) * 0.99 * 100) / 100)
);

const limboFromN = Math.max(
  1,
  Math.floor((0.99 / (1 / 2 ** 32)) * 100) / 100
);
assert.notEqual(
  deriveStakeCrashPoint(1),
  limboFromN,
  "Crash uses 2^32/(N+1), not Limbo's 0.99/u"
);

const committed = commitCrashRound({ nonce: 7 });
assert.equal(committed.nonce, 7);
assert.equal(committed.clientSeed, "crash-public");
assert.equal(committed.serverSeedHash, hashServerSeed(committed.serverSeed));
assert.equal(committed.crashPoint, deriveStakeCrashPoint(committed.n, committed.rtp));
assert.equal(committed.rtpPercent, 99);
assert.equal(committed.alt, false);

const waitingPublic = publicCrashFairness({
  phase: "waiting",
  currentRound: committed,
});
assert.equal(waitingPublic.serverSeedHash, committed.serverSeedHash);
assert.equal(waitingPublic.rtpPercent, 99);
assert.equal(waitingPublic.serverSeed, undefined);
assert.equal(waitingPublic.n, undefined);
assert.equal(waitingPublic.crashPoint, undefined);

const runningPublic = publicCrashFairness({
  phase: "running",
  currentRound: committed,
});
assert.equal(runningPublic.serverSeed, undefined);
assert.equal(runningPublic.n, undefined);
assert.equal(runningPublic.crashPoint, undefined);

const crashedPublic = publicCrashFairness({
  phase: "crashed",
  currentRound: committed,
});
assert.equal(crashedPublic.serverSeed, committed.serverSeed);
assert.equal(crashedPublic.n, committed.n);
assert.equal(crashedPublic.crashPoint, committed.crashPoint);
assert.equal(crashedPublic.revealed.serverSeed, committed.serverSeed);

const nextRound = commitCrashRound({ nonce: 8, alt: true, startStreak: true });
assert.notEqual(
  nextRound.serverSeed,
  committed.serverSeed,
  "Each crash round uses a fresh server seed"
);
assert.equal(nextRound.alt, true, "Alt rounds HMAC-pick RTP from the alt list");
assert.ok(
  [40, 50, 60, 70, 80, 90].includes(nextRound.rtpPercent),
  "Alt crash rounds must pick 40/50/60/70/80/90"
);
assert.ok(
  nextRound.streakLength >= 1 && nextRound.streakLength <= 6,
  "First alt round HMAC-picks a 1–6 streak length"
);
assert.equal(nextRound.streakIndex, 1);
assert.equal(
  nextRound.crashPoint,
  deriveStakeCrashPoint(nextRound.n, nextRound.rtp)
);

const continued = commitCrashRound({
  nonce: 9,
  alt: true,
  streakLength: nextRound.streakLength,
  streakIndex: 2,
});
assert.equal(continued.alt, true);
assert.equal(continued.streakLength, nextRound.streakLength);
assert.equal(continued.streakIndex, 2);
assert.ok([40, 50, 60, 70, 80, 90].includes(continued.rtpPercent));

const waitingAfter = publicCrashFairness({
  phase: "waiting",
  currentRound: nextRound,
  revealedRound: committed,
});
assert.equal(waitingAfter.serverSeedHash, nextRound.serverSeedHash);
assert.equal(waitingAfter.serverSeed, undefined);
assert.equal(waitingAfter.revealed.serverSeed, committed.serverSeed);

console.log("crash payout tests passed");
