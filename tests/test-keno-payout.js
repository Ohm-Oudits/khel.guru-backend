import assert from "node:assert/strict";
import { chances } from "../socket/modules/keno/constants.js";

const binom = (n, k) => {
  if (k < 0 || k > n) return 0n;
  k = Math.min(k, n - k);
  let result = 1n;
  const N = BigInt(n);
  const K = BigInt(k);
  for (let i = 1n; i <= K; i += 1n) {
    result = (result * (N - K + i)) / i;
  }
  return result;
};

const TOTAL_DRAWS = Number(binom(40, 10));

const hitProbability = (picks, hits) =>
  Number(binom(picks, hits) * binom(40 - picks, 10 - hits)) / TOTAL_DRAWS;

const rowRtp = (picks, multipliers) => {
  let rtp = 0;
  for (let hits = 0; hits <= picks; hits += 1) {
    rtp += hitProbability(picks, hits) * (multipliers[hits] || 0);
  }
  return rtp;
};

assert.equal(TOTAL_DRAWS, 847660528);

const allHitPick1 = hitProbability(1, 1);
assert.equal(allHitPick1, 0.25);
assert.equal(Number((0.99 / allHitPick1).toFixed(2)), 3.96);

const allHitPick3 = hitProbability(3, 3);
assert.equal(Number((0.99 / allHitPick3).toFixed(2)), 81.51);

for (const risk of ["Classic", "Low", "Medium", "High"]) {
  const tables = chances(risk);
  assert.equal(tables.length, 10, `${risk} must cover picks 1–10`);
  for (const row of tables) {
    const rtp = rowRtp(row.length, row.values[0]);
    assert(
      rtp >= 0.985 && rtp <= 0.995,
      `${risk} pick ${row.length} RTP is ${(rtp * 100).toFixed(3)}%, expected ~99%`
    );
  }
}

const high = chances("High");
assert.equal(high[0].values[0][1], 3.96);
assert.equal(high[1].values[0][2], 17.16);
assert.equal(high[2].values[0][3], 81.51);

const low = chances("Low");
assert.equal(low[0].values[0][1], 3.96);
assert.equal(chances("Medium")[0].values[0][1], 3.96);

console.log("Keno payout RTP test passed");
