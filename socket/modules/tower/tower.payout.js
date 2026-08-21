import {
  TOWER_ROWS,
  floatsNeededForTower,
  getTowerLevelConfig,
  getTowerDifficulty,
  normalizeTowerDifficulty,
} from "./tower.constants.js";

export const TOWER_PAYOUT_FORMULAS = {
  win: "betAmount × maxMultiplier",
  checkout: "betAmount × maxMultiplier × (progress / rows)",
  progress: "rows - currentRow - 1",
};

export const getTowerProgress = ({ currentRow, rows = TOWER_ROWS }) => {
  if (currentRow == null || !Number.isFinite(Number(currentRow))) {
    return 0;
  }

  return Math.max(0, rows - Number(currentRow) - 1);
};

export const getTowerMaxMultiplier = (difficulty) =>
  getTowerLevelConfig(difficulty).multiplier;

export const computeTowerCheckoutMultiplier = ({
  difficulty,
  currentRow,
  rows = TOWER_ROWS,
}) => {
  const maxMultiplier = getTowerMaxMultiplier(difficulty);
  const progress = getTowerProgress({ currentRow, rows });
  return maxMultiplier * (progress / rows);
};

export const computeTowerCheckoutProfit = ({
  difficulty,
  betAmount,
  currentRow,
  rows = TOWER_ROWS,
}) => {
  const stake = Number(betAmount);
  if (!Number.isFinite(stake) || stake <= 0) {
    return 0;
  }

  const multiplier = computeTowerCheckoutMultiplier({
    difficulty,
    currentRow,
    rows,
  });
  const profit = stake * multiplier;
  return Number.isNaN(profit) ? 0 : profit;
};

export const computeTowerWinProfit = ({ difficulty, betAmount }) => {
  const stake = Number(betAmount);
  if (!Number.isFinite(stake) || stake <= 0) {
    return 0;
  }

  return stake * getTowerMaxMultiplier(difficulty);
};

export const buildTowerPayoutSnapshot = ({
  difficulty,
  betAmount = 0,
  currentRow = null,
  rows = TOWER_ROWS,
  stepsCompleted = 0,
}) => {
  const maxMultiplier = getTowerMaxMultiplier(difficulty);
  const progress = getTowerProgress({ currentRow, rows });
  const checkoutMultiplier = computeTowerCheckoutMultiplier({
    difficulty,
    currentRow,
    rows,
  });

  return {
    rows,
    maxMultiplier,
    progress,
    stepsCompleted,
    checkoutMultiplier,
    checkoutProfit: computeTowerCheckoutProfit({
      difficulty,
      betAmount,
      currentRow,
      rows,
    }),
    winProfit: computeTowerWinProfit({ difficulty, betAmount }),
    formulas: TOWER_PAYOUT_FORMULAS,
  };
};

export const buildTowerFairnessPayload = (tower, { betAmount } = {}) => {
  const difficulty = normalizeTowerDifficulty(tower.difficulty);
  const config = getTowerDifficulty(difficulty);
  const payout = buildTowerPayoutSnapshot({
    difficulty,
    betAmount: betAmount ?? tower.betAmount ?? 0,
    currentRow: tower.currentRow,
    rows: tower.grid?.length ?? TOWER_ROWS,
    stepsCompleted: tower.stepsCompleted ?? 0,
  });

  return {
    nonce: tower.nonce,
    clientSeed: tower.clientSeed,
    serverSeedHash: tower.serverSeedHash,
    step: tower.stepsCompleted ?? 0,
    difficulty,
    rows: payout.rows,
    cols: tower.cols ?? config.cols,
    eggCount: config.eggCount,
    floatCount: floatsNeededForTower(difficulty),
    ...payout,
  };
};
