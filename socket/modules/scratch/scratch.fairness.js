const indexFromFloat = (float, length) => {
  if (!length) return 0;
  return Math.min(length - 1, Math.floor(Number(float) * length));
};

export const SCRATCH_CELL_COUNT = 9;
export const SCRATCH_FLOAT_COUNT = 18;

export const SCRATCH_DIAMOND_TYPES = [
  "red",
  "blue",
  "green",
  "yellow",
  "purple",
];

export const SCRATCH_BALLOON_TYPES = [
  "#F28B82",
  "#FBBC05",
  "#34A853",
  "#4285F4",
  "#9A67EA",
];

export const SCRATCH_FAIRNESS_FORMULA =
  "HMAC_SHA256(serverSeed, clientSeed:nonce:round) → 18 floats. Cells are left-to-right, top-to-bottom. Diamond i = palette[floor(u_i × 5)]. Balloon i = palette[floor(u_{9+i} × 5)]. Unrevealed diamonds are withheld. Rotate the scratch seed pair to replay the 9 diamond colors.";

export const deriveScratchGridFromFloats = (floats = []) => {
  const cells = [];
  for (let i = 0; i < SCRATCH_CELL_COUNT; i += 1) {
    const diamondIndex = indexFromFloat(
      floats[i],
      SCRATCH_DIAMOND_TYPES.length
    );
    const balloonIndex = indexFromFloat(
      floats[SCRATCH_CELL_COUNT + i],
      SCRATCH_BALLOON_TYPES.length
    );
    cells.push({
      revealed: false,
      animating: false,
      diamondColor: SCRATCH_DIAMOND_TYPES[diamondIndex],
      balloonColor: SCRATCH_BALLOON_TYPES[balloonIndex],
    });
  }
  return cells;
};

export const publicScratchGrid = (grid = []) =>
  grid.map((cell) => ({
    revealed: Boolean(cell.revealed),
    animating: Boolean(cell.animating),
    balloonColor: cell.balloonColor,
    diamondColor: cell.revealed ? cell.diamondColor : null,
  }));

export const publicScratchFairness = (fairness = {}) => ({
  nonce: fairness.nonce,
  clientSeed: fairness.clientSeed,
  serverSeedHash: fairness.serverSeedHash,
});
