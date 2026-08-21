export const MINES_TILES = 25;
export const MINES_EVENT_COUNT = 24;
export const MINES_RTP = 0.99;
export const MINES_FAIRNESS_FORMULA =
  "HMAC_SHA256(serverSeed, clientSeed:nonce:round) → 24 floats → Fisher-Yates on 25 tiles (left-to-right, top-to-bottom). Mines = first M unique indexes. Cashout X_K = 0.99 / Π_i=0^{K-1} (25-M-i)/(25-i)";

const clampFloat = (value) => {
  const x = Number(value);
  if (!Number.isFinite(x) || x < 0) return 0;
  return Math.min(x, 0.999999999999);
};

/**
 * Fisher–Yates: 24 events on a 25-tile board. Each float is scaled by the
 * remaining unique tiles (`size - i`). The first `mineCount` indexes are mines.
 */
export const shuffleMinesFromFloats = (floats = [], mineCount) => {
  const count = Math.min(
    MINES_EVENT_COUNT,
    Math.max(1, Math.floor(Number(mineCount) || 0))
  );
  const tiles = Array.from({ length: MINES_TILES }, (_, index) => index);

  for (let i = 0; i < MINES_TILES - 1; i += 1) {
    const remaining = MINES_TILES - i;
    const offset = Math.min(
      remaining - 1,
      Math.floor(clampFloat(floats[i]) * remaining)
    );
    const j = i + offset;
    const swap = tiles[i];
    tiles[i] = tiles[j];
    tiles[j] = swap;
  }

  return tiles.slice(0, count).sort((a, b) => a - b);
};

export const sanitizeMinesGridForClient = (grid, revealAll = false) => {
  if (!Array.isArray(grid)) return grid;
  return grid.map((tile) => {
    const plain = plainTile(tile);
    const revealed = revealAll ? true : Boolean(plain.revealed);
    if (!revealed) {
      return { revealed: false };
    }
    return {
      type: plain.type === "bomb" ? "bomb" : "diamond",
      revealed: true,
    };
  });
};

const plainTile = (tile) => {
  if (tile == null || typeof tile !== "object") return {};
  if (typeof tile.toObject === "function") return tile.toObject();
  if (typeof tile.get === "function") {
    return {
      type: tile.get("type"),
      revealed: tile.get("revealed"),
    };
  }
  return tile;
};

export const countRevealedDiamonds = (grid = []) =>
  (Array.isArray(grid) ? grid : []).filter((tile) => {
    const plain = plainTile(tile);
    return Boolean(plain.revealed) && plain.type !== "bomb";
  }).length;

/** Revealed gems from remaining `gems` and/or the board. */
export const revealedGemsFromRound = (game = {}) => {
  const mines = Number(game.mines);
  const remaining = Number(game.gems);
  const totalSafe = MINES_TILES - mines;
  const fromRemaining =
    Number.isInteger(mines) && Number.isFinite(remaining)
      ? totalSafe - remaining
      : 0;
  const fromGrid = countRevealedDiamonds(game.grid);
  return Math.max(0, fromRemaining, fromGrid);
};

/** P(K gems | M mines) = Π (25-M-i)/(25-i) for i in [0, K). */
export const minesSafeProbability = (mineCount, gemsRevealed) => {
  const mines = Number(mineCount);
  const gems = Number(gemsRevealed);
  if (
    !Number.isInteger(mines) ||
    !Number.isInteger(gems) ||
    mines < 1 ||
    mines > MINES_EVENT_COUNT ||
    gems < 1 ||
    gems > MINES_TILES - mines
  ) {
    return 0;
  }

  let probability = 1;
  for (let i = 0; i < gems; i += 1) {
    probability *= (MINES_TILES - mines - i) / (MINES_TILES - i);
  }
  return probability;
};

/**
 * Stake-style 99% RTP. 0.99 is applied once to the whole path, not 0.99^K.
 * X_K = 0.99 / P_K. Zero gems cashout returns the stake (1.00x).
 */
export const minesMultiplier = (mineCount, gemsRevealed) => {
  const gems = Number(gemsRevealed);
  if (!Number.isInteger(gems) || gems <= 0) {
    return 1;
  }
  const probability = minesSafeProbability(mineCount, gemsRevealed);
  if (probability <= 0) {
    return 0;
  }
  return MINES_RTP / probability;
};

export const settleMinesCashout = ({
  betAmount,
  mineCount,
  gemsRevealed,
}) => {
  const stake = Number(betAmount);
  const multiplier = minesMultiplier(mineCount, gemsRevealed);
  const safeStake = Number.isFinite(stake) && stake > 0 ? stake : 0;
  const payout = safeStake * (Number.isFinite(multiplier) ? multiplier : 0);
  return {
    multiplier: Number.isFinite(multiplier) ? multiplier : 0,
    payout,
    profit: payout - safeStake,
    gemsRevealed: Math.max(0, Number(gemsRevealed) || 0),
  };
};

export const buildMinesFairnessPayload = (game = {}) => {
  if (game.nonce == null) {
    return null;
  }

  const gemsRevealed = revealedGemsFromRound(game);
  const settlement = settleMinesCashout({
    betAmount: game.betAmount,
    mineCount: game.mines,
    gemsRevealed,
  });

  return {
    gameKey: "mines",
    nonce: game.nonce,
    clientSeed: game.clientSeed,
    serverSeedHash: game.serverSeedHash,
    mineCount: game.mines,
    gemsRevealed,
    eventCount: MINES_EVENT_COUNT,
    multiplier: settlement.multiplier,
    formula: MINES_FAIRNESS_FORMULA,
  };
};

export const serializeMinesState = (game, { revealAll = false } = {}) => {
  const plain = game?.toObject ? game.toObject() : { ...game };
  return {
    ...plain,
    grid: sanitizeMinesGridForClient(plain.grid, revealAll),
    fairness: buildMinesFairnessPayload(plain),
  };
};
