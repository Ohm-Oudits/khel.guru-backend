export const PLINKO_MIN_ROWS = 8;
export const PLINKO_MAX_ROWS = 16;
export const PLINKO_RTP = 0.99;
export const PLINKO_HOUSE_EDGE = 0.01;
export const PLINKO_FAIRNESS_FORMULA =
  "HMAC_SHA256(serverSeed, clientSeed:nonce:round) → n floats. Bounce i is Right if float_i ≥ 0.5 else Left. Slot k = count of Rights. P(k)=C(n,k)/2^n. Payout tables are designed so Σ P(k)M(k) ≈ 0.99; not 0.99/P(k) per slot.";

export const PLINKO_RISKS = ["Easy", "Medium", "Hard", "Expert"];

const RISK_ALIASES = {
  Easy: "Easy",
  Low: "Easy",
  Medium: "Medium",
  Hard: "Hard",
  High: "Hard",
  Expert: "Expert",
};

export const normalizePlinkoRisk = (risk) => RISK_ALIASES[risk] || null;

export const normalizePlinkoRows = (rows) => {
  const n = Number(rows);
  if (!Number.isInteger(n) || n < PLINKO_MIN_ROWS || n > PLINKO_MAX_ROWS) {
    return null;
  }
  return n;
};

/** Stake-style 8–16 row tables. Easy/Medium/Hard match the live Low/Med/High paytable; Expert uses published edge maxes with 0.1x middles so Σ P(k)M(k) ≈ 0.99. */
export const BIN_PAYOUTS = {
  8: {
    Easy: [5.6, 2.1, 1.1, 1, 0.5, 1, 1.1, 2.1, 5.6],
    Medium: [13, 3, 1.3, 0.7, 0.4, 0.7, 1.3, 3, 13],
    Hard: [29, 4, 1.5, 0.3, 0.2, 0.3, 1.5, 4, 29],
    Expert: [50, 3.3, 1.2, 0.24, 0.1, 0.24, 1.2, 3.3, 50],
  },
  9: {
    Easy: [5.6, 2, 1.6, 1, 0.7, 0.7, 1, 1.6, 2, 5.6],
    Medium: [18, 4, 1.7, 0.9, 0.5, 0.5, 0.9, 1.7, 4, 18],
    Hard: [43, 7, 2, 0.6, 0.2, 0.2, 0.6, 2, 7, 43],
    Expert: [100, 5.4, 1.5, 0.46, 0.1, 0.1, 0.46, 1.5, 5.4, 100],
  },
  10: {
    Easy: [8.9, 3, 1.4, 1.1, 1, 0.5, 1, 1.1, 1.4, 3, 8.9],
    Medium: [22, 5, 2, 1.4, 0.6, 0.4, 0.6, 1.4, 2, 5, 22],
    Hard: [76, 10, 3, 0.9, 0.3, 0.2, 0.3, 0.9, 3, 10, 76],
    Expert: [201, 7, 2.2, 0.65, 0.22, 0.1, 0.22, 0.65, 2.2, 7, 201],
  },
  11: {
    Easy: [8.4, 3, 1.9, 1.3, 1, 0.7, 0.7, 1, 1.3, 1.9, 3, 8.4],
    Medium: [24, 6, 3, 1.8, 0.7, 0.5, 0.5, 0.7, 1.8, 3, 6, 24],
    Hard: [120, 14, 5.2, 1.4, 0.4, 0.2, 0.2, 0.4, 1.4, 5.2, 14, 120],
    Expert: [324, 12.5, 4.7, 1.3, 0.1, 0.1, 0.1, 0.1, 1.3, 4.7, 12.5, 324],
  },
  12: {
    Easy: [10, 3, 1.6, 1.4, 1.1, 1, 0.5, 1, 1.1, 1.4, 1.6, 3, 10],
    Medium: [33, 11, 4, 2, 1.1, 0.6, 0.3, 0.6, 1.1, 2, 4, 11, 33],
    Hard: [170, 24, 8.1, 2, 0.7, 0.2, 0.2, 0.2, 0.7, 2, 8.1, 24, 170],
    Expert: [619, 18.7, 6.5, 1.6, 0.56, 0.1, 0.1, 0.1, 0.56, 1.6, 6.5, 18.7, 619],
  },
  13: {
    Easy: [8.1, 4, 3, 1.9, 1.2, 0.9, 0.7, 0.7, 0.9, 1.2, 1.9, 3, 4, 8.1],
    Medium: [43, 13, 6, 3, 1.3, 0.7, 0.4, 0.4, 0.7, 1.3, 3, 6, 13, 43],
    Hard: [260, 37, 11, 4, 1, 0.2, 0.2, 0.2, 0.2, 1, 4, 11, 37, 260],
    Expert: [1012, 40.1, 11.8, 4.3, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 4.3, 11.8, 40.1, 1012],
  },
  14: {
    Easy: [7.1, 4, 1.9, 1.4, 1.3, 1.1, 1, 0.5, 1, 1.1, 1.3, 1.4, 1.9, 4, 7.1],
    Medium: [58, 15, 7, 4, 1.9, 1, 0.5, 0.2, 0.5, 1, 1.9, 4, 7, 15, 58],
    Hard: [420, 56, 18, 5, 1.9, 0.3, 0.2, 0.2, 0.2, 0.3, 1.9, 5, 18, 56, 420],
    Expert: [2369, 44.2, 14.9, 4.1, 1.6, 0.1, 0.1, 0.1, 0.1, 0.1, 1.6, 4.1, 14.9, 44.2, 2369],
  },
  15: {
    Easy: [15, 8, 3, 2, 1.5, 1.1, 1, 0.7, 0.7, 1, 1.1, 1.5, 2, 3, 8, 15],
    Medium: [88, 18, 11, 5, 3, 1.3, 0.5, 0.3, 0.3, 0.5, 1.3, 3, 5, 11, 18, 88],
    Hard: [620, 83, 27, 8, 3, 0.5, 0.2, 0.2, 0.2, 0.2, 0.5, 3, 8, 27, 83, 620],
    Expert: [5000, 67.9, 22.3, 6.6, 2.5, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 2.5, 6.6, 22.3, 67.9, 5000],
  },
  16: {
    Easy: [16, 9, 2, 1.4, 1.4, 1.2, 1.1, 1, 0.5, 1, 1.1, 1.2, 1.4, 1.4, 2, 9, 16],
    Medium: [110, 41, 10, 5, 3, 1.5, 1, 0.5, 0.3, 0.5, 1, 1.5, 3, 5, 10, 41, 110],
    Hard: [1000, 130, 26, 9, 4, 2, 0.2, 0.2, 0.2, 0.2, 0.2, 2, 4, 9, 26, 130, 1000],
    Expert: [10000, 104.3, 19.7, 6.8, 3, 1.5, 0.1, 0.1, 0.1, 0.1, 0.1, 1.5, 3, 6.8, 19.7, 104.3, 10000],
  },
};

export const binomialCoefficient = (n, k) => {
  if (k < 0 || k > n) return 0;
  let result = 1;
  for (let i = 1; i <= k; i += 1) {
    result = (result * (n - k + i)) / i;
  }
  return result;
};

/** P(k) = C(n,k) / 2^n */
export const plinkoSlotProbability = (rows, slot) => {
  const n = Number(rows);
  const k = Number(slot);
  if (!Number.isInteger(n) || !Number.isInteger(k) || k < 0 || k > n) return 0;
  return binomialCoefficient(n, k) / 2 ** n;
};

export const plinkoSlotProbabilities = (rows) => {
  const n = Number(rows);
  if (!Number.isInteger(n) || n < 0) return [];
  return Array.from({ length: n + 1 }, (_, k) => plinkoSlotProbability(n, k));
};

export const plinkoTableRtp = (rows, multipliers = []) => {
  const probabilities = plinkoSlotProbabilities(rows);
  if (probabilities.length !== multipliers.length) return 0;
  return probabilities.reduce(
    (sum, probability, index) => sum + probability * Number(multipliers[index] || 0),
    0
  );
};

export const getPlinkoTable = (rows, risk) => {
  const n = normalizePlinkoRows(rows);
  const key = normalizePlinkoRisk(risk);
  if (n == null || !key) return null;
  const table = BIN_PAYOUTS[n]?.[key];
  return Array.isArray(table) ? table : null;
};

export const pathToBin = (path = []) =>
  path.reduce((sum, step) => sum + (step ? 1 : 0), 0);

export const floatsToPlinkoPath = (floats = []) =>
  floats.map((value) => (value >= 0.5 ? 1 : 0));

export const settlePlinkoDrop = ({ betAmount, rows, risk, bin }) => {
  const table = getPlinkoTable(rows, risk);
  const stake = Number(betAmount);
  const slot = Number(bin);
  if (!table) {
    return { multiplier: null, payout: 0 };
  }
  if (!Number.isInteger(slot) || slot < 0 || slot >= table.length) {
    return { multiplier: null, payout: 0 };
  }
  const multiplier = table[slot];
  const safeStake = Number.isFinite(stake) && stake > 0 ? stake : 0;
  return { multiplier, payout: safeStake * multiplier };
};
