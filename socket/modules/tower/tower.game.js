import {
  deriveTowerGridFromFloats,
  sanitizeTowerGridForClient,
} from "./tower.fairness.js";
import {
  TOWER_ROWS,
  floatsNeededForTower,
  getTowerDifficulty,
  normalizeTowerDifficulty,
} from "./tower.constants.js";
import { buildTowerFairnessPayload } from "./tower.payout.js";

export const buildTowerGrid = (floats, difficulty) =>
  deriveTowerGridFromFloats(floats, difficulty);

export const getRowColFromIndex = (index, cols) => ({
  row: Math.floor(index / cols),
  col: index % cols,
});

export const revealAllBoxes = (grid) => {
  for (let row = 0; row < grid.length; row += 1) {
    for (let col = 0; col < grid[row].length; col += 1) {
      grid[row][col].revealed = true;
    }
  }
};

export const serializeTowerState = (tower, { revealAll = false } = {}) => {
  const plain = tower?.toObject ? tower.toObject() : { ...tower };
  const grid = sanitizeTowerGridForClient(plain.grid, revealAll);
  const fairness = plain.nonce != null ? buildTowerFairnessPayload(plain) : null;

  return {
    ...plain,
    grid,
    difficulty: normalizeTowerDifficulty(plain.difficulty),
    cols: plain.cols ?? getTowerDifficulty(plain.difficulty).cols,
    rows: TOWER_ROWS,
    fairness,
  };
};

export {
  floatsNeededForTower,
  getTowerDifficulty,
  normalizeTowerDifficulty,
  TOWER_ROWS,
  buildTowerFairnessPayload,
};
