import { takeFairnessFloats } from "../../../services/provablyFair.service.js";
import {
  normalizeTowerDifficulty,
  TOWER_ROWS,
  getTowerLevelConfig,
} from "./tower.constants.js";

/**
 * Fisher–Yates partial shuffle: pick `eggCount` unique tile indices in [0, size).
 * Returns sorted egg columns per Tower level, e.g. easy → [0, 1, 3].
 */
export const pickEggColumnsForLevel = (floats, size, eggCount) => {
  const tiles = Array.from({ length: size }, (_, index) => index);
  for (let i = 0; i < eggCount; i += 1) {
    const remaining = size - i;
    const j = i + Math.floor((floats[i] || 0) * remaining);
    [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
  }
  return tiles.slice(0, eggCount).sort((a, b) => a - b);
};

export const deriveTowerGridFromFloats = (floats, difficulty) => {
  const key = normalizeTowerDifficulty(difficulty);
  const { count: eggCount, size } = getTowerLevelConfig(key);
  let offset = 0;

  const grid = Array.from({ length: TOWER_ROWS }, () =>
    Array.from({ length: size }, () => ({
      revealed: false,
      isCorrect: false,
    }))
  );

  const eggLevels = [];

  for (let level = 0; level < TOWER_ROWS; level += 1) {
    const levelFloats = floats.slice(offset, offset + eggCount);
    offset += eggCount;
    const eggColumns = pickEggColumnsForLevel(levelFloats, size, eggCount);
    eggLevels.push(eggColumns);
    eggColumns.forEach((col) => {
      grid[level][col].isCorrect = true;
    });
  }

  return {
    grid,
    cols: size,
    size,
    eggCount,
    rows: TOWER_ROWS,
    difficulty: key,
    eggLevels,
  };
};

export const sanitizeTowerGridForClient = (grid, revealAll = false) => {
  if (!Array.isArray(grid)) return grid;
  return grid.map((row) =>
    row.map((cell) => ({
      revealed: revealAll ? true : Boolean(cell?.revealed),
      ...(revealAll || cell?.revealed
        ? { isCorrect: Boolean(cell?.isCorrect) }
        : {}),
    }))
  );
};
