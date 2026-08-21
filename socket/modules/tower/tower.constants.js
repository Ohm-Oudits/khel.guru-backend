export const TOWER_ROWS = 9;

/** Tower level map — count = eggs per level, size = tiles per level. */
export const TOWER_LEVEL_MAP = {
  easy: { count: 3, size: 4, multiplier: 1.5 },
  medium: { count: 2, size: 3, multiplier: 2 },
  hard: { count: 1, size: 2, multiplier: 3 },
  extreme: { count: 1, size: 3, multiplier: 4 },
  nightmare: { count: 1, size: 4, multiplier: 5 },
};

const DIFFICULTY_ALIASES = {
  easy: "easy",
  Easy: "easy",
  medium: "medium",
  Medium: "medium",
  hard: "hard",
  Hard: "hard",
  extreme: "extreme",
  Extreme: "extreme",
  expert: "extreme",
  Expert: "extreme",
  nightmare: "nightmare",
  Nightmare: "nightmare",
  master: "nightmare",
  Master: "nightmare",
};

export const normalizeTowerDifficulty = (difficulty) =>
  DIFFICULTY_ALIASES[difficulty] || "easy";

export const getTowerLevelConfig = (difficulty) =>
  TOWER_LEVEL_MAP[normalizeTowerDifficulty(difficulty)] || TOWER_LEVEL_MAP.easy;

export const getTowerDifficulty = (difficulty) => {
  const { count, size, multiplier } = getTowerLevelConfig(difficulty);
  return {
    count,
    size,
    cols: size,
    correctPerRow: count,
    eggCount: count,
    multiplier,
  };
};

export const floatsNeededForTower = (difficulty) =>
  TOWER_ROWS * getTowerLevelConfig(difficulty).count;
