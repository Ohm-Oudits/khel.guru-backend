export const TWIST_RING_VALUES = {
  purple: [3.9, 12.5, 28, 52, 85, 133, 200, 300],
  orange: [2.5, 7.7, 16, 27.5, 44, 64],
  green: [1.55, 4.85, 10, 17],
};

export const TWIST_RING_MAX = {
  purple: TWIST_RING_VALUES.purple.length,
  orange: TWIST_RING_VALUES.orange.length,
  green: TWIST_RING_VALUES.green.length,
};

/** Inclusive-end buckets on a fairness float in [0, 1). */
export const TWIST_OUTCOME_TABLE = [
  { outcome: "green", max: 0.25, chance: 0.25, label: "Gem 1 (inner)" },
  { outcome: "orange", max: 0.45, chance: 0.2, label: "Gem 2 (middle)" },
  { outcome: "purple", max: 0.6, chance: 0.15, label: "Gem 3 (outer)" },
  { outcome: "null", max: 0.75, chance: 0.15, label: "Neutral" },
  { outcome: "skull", max: 1, chance: 0.25, label: "Skull" },
];

export const TWIST_OUTCOMES = TWIST_OUTCOME_TABLE.map((row) => row.outcome);

export const TWIST_FAIRNESS_FORMULA =
  "HMAC_SHA256(serverSeed, clientSeed:nonce:round) → float in [0,1) → outcome table";
