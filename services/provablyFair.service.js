import crypto from "node:crypto";

export const FAIRNESS_GAMES = [
  {
    gameKey: "dice",
    title: "Dice",
    verificationMode: "number-roll",
    defaultHouseEdgePercent: 1,
    engineStatus: "seed-ready",
  },
  {
    gameKey: "limbo",
    title: "Limbo",
    verificationMode: "multiplier",
    defaultHouseEdgePercent: 1,
    engineStatus: "seed-ready",
  },
  {
    gameKey: "slide",
    title: "Slide",
    verificationMode: "multiplier",
    defaultHouseEdgePercent: 1,
    engineStatus: "seed-ready",
  },
  {
    gameKey: "parachute",
    title: "Parachute",
    verificationMode: "multiplier",
    defaultHouseEdgePercent: 1,
    engineStatus: "seed-ready",
  },
  {
    gameKey: "pump",
    title: "Pump",
    verificationMode: "multiplier",
    defaultHouseEdgePercent: 1,
    engineStatus: "seed-ready",
  },
  {
    gameKey: "crash",
    title: "Crash",
    verificationMode: "multiplier",
    defaultHouseEdgePercent: 1,
    engineStatus: "seed-ready",
  },
  {
    gameKey: "mines",
    title: "Mines",
    verificationMode: "mine-layout",
    defaultHouseEdgePercent: null,
    engineStatus: "seed-ready",
  },
  {
    gameKey: "wheel",
    title: "Wheel",
    verificationMode: "segment-index",
    defaultHouseEdgePercent: 1,
    engineStatus: "seed-ready",
  },
  {
    gameKey: "roulette",
    title: "Roulette",
    verificationMode: "roulette-pocket",
    defaultHouseEdgePercent: 2.7,
    engineStatus: "seed-ready",
  },
  {
    gameKey: "plinko",
    title: "Plinko",
    verificationMode: "pin-path",
    defaultHouseEdgePercent: null,
    engineStatus: "seed-ready",
  },
];

export const getFairnessGameCatalog = () => FAIRNESS_GAMES;

export const isSupportedFairnessGame = (gameKey) =>
  FAIRNESS_GAMES.some((game) => game.gameKey === gameKey);

export const generateServerSeed = () => crypto.randomBytes(32).toString("hex");

export const generateClientSeed = () => crypto.randomBytes(16).toString("hex");

export const hashServerSeed = (serverSeed) =>
  crypto.createHash("sha256").update(serverSeed).digest("hex");

export const createSeedRecordPayload = ({ gameKey, clientSeed = null }) => {
  const serverSeed = generateServerSeed();

  return {
    gameKey,
    clientSeed: clientSeed || generateClientSeed(),
    serverSeed,
    serverSeedHash: hashServerSeed(serverSeed),
  };
};

export const deriveFairnessDigest = ({
  serverSeed,
  clientSeed,
  nonce,
  cursor = 0,
}) =>
  crypto
    .createHmac("sha256", serverSeed)
    .update(`${clientSeed}:${nonce}:${cursor}`)
    .digest("hex");

export const deriveNormalizedRoll = (input) => {
  const digest = deriveFairnessDigest(input);
  const numeric = Number.parseInt(digest.slice(0, 13), 16) / 16 ** 13;

  return {
    digest,
    normalizedRoll: Number(numeric.toFixed(12)),
  };
};

// Stake-style HMAC byte stream: HMAC_SHA256(serverSeed, `${clientSeed}:${nonce}:${round}`)
// walked with a cursor. Each float consumes 4 bytes as a base-256 fraction in [0, 1).
const hmacBytesFromRound = ({ serverSeed, clientSeed, nonce, round }) =>
  crypto
    .createHmac("sha256", serverSeed)
    .update(`${clientSeed}:${nonce}:${round}`)
    .digest();

export const bytesToFloat = (bytes) =>
  bytes.reduce((sum, value, index) => sum + value / 256 ** (index + 1), 0);

export const takeFairnessFloats = ({
  serverSeed,
  clientSeed,
  nonce,
  count,
  cursor = 0,
}) => {
  const floats = [];
  let round = Math.floor(cursor / 32);
  let offset = cursor - round * 32;
  let buffer = hmacBytesFromRound({ serverSeed, clientSeed, nonce, round });

  const nextByte = () => {
    if (offset >= 32) {
      round += 1;
      offset = 0;
      buffer = hmacBytesFromRound({ serverSeed, clientSeed, nonce, round });
    }
    const value = buffer[offset];
    offset += 1;
    return value;
  };

  for (let i = 0; i < count; i += 1) {
    floats.push(bytesToFloat([nextByte(), nextByte(), nextByte(), nextByte()]));
  }

  return floats;
};

const HOUSE_EDGE = 0.01;

// Stake dice: 10,001 buckets covering 0.00 through 100.00.
export const deriveDiceRoll = (float) => Math.floor(float * 10001) / 100;

// Stake limbo / crash-style: crashPoint = floor((0.99 / float) * 100) / 100.
export const deriveCrashPoint = (float, houseEdge = HOUSE_EDGE) => {
  if (!(float > 0)) return 1;
  const point = (1 - houseEdge) / float;
  return Math.max(1, Math.floor(point * 100) / 100);
};

export const deriveLimboMultiplier = (float) => deriveCrashPoint(float);

export const deriveOutcomeIndex = (float, length) => {
  if (!length) return 0;
  return Math.min(length - 1, Math.floor(float * length));
};

/** Stake roulette: floor(float × 37) → European pocket 0–36 (uniform 1/37 each). */
export const deriveRoulettePocket = (float) => deriveOutcomeIndex(float, 37);

export const shuffleMinesFromFloats = (floats, mineCount) => {
  const size = 25;
  const tiles = Array.from({ length: size }, (_, i) => i);
  for (let i = 0; i < size - 1; i += 1) {
    const remaining = size - i;
    const j = i + Math.floor((floats[i] || 0) * remaining);
    const swap = tiles[i];
    tiles[i] = tiles[j];
    tiles[j] = swap;
  }
  return tiles.slice(0, mineCount).sort((a, b) => a - b);
};

export const deriveMinesLayout = ({
  serverSeed,
  clientSeed,
  nonce,
  mineCount,
}) => {
  const floats = takeFairnessFloats({
    serverSeed,
    clientSeed,
    nonce,
    count: 24,
  });
  return shuffleMinesFromFloats(floats, mineCount);
};

export const derivePlinkoPath = ({
  serverSeed,
  clientSeed,
  nonce,
  rows,
}) => {
  const floats = takeFairnessFloats({
    serverSeed,
    clientSeed,
    nonce,
    count: rows,
    cursor: 0,
  });
  // 0 = left, 1 = right. Bin index is the count of rights (far-left = 0).
  const path = floats.map((value) => (value >= 0.5 ? 1 : 0));
  const bin = path.reduce((sum, step) => sum + step, 0);
  return { path, bin };
};

export const deriveGameResult = ({ gameKey, normalizedRoll }) => {
  if (gameKey === "dice") {
    return deriveDiceRoll(normalizedRoll);
  }

  if (
    gameKey === "limbo" ||
    gameKey === "slide" ||
    gameKey === "crash" ||
    gameKey === "parachute" ||
    gameKey === "pump"
  ) {
    return deriveCrashPoint(normalizedRoll);
  }

  return Number(normalizedRoll.toFixed(12));
};

export const createHouseStream = (gameKey) => {
  const payload = createSeedRecordPayload({
    gameKey,
    clientSeed: `${gameKey}-public`,
  });
  let nonce = 0;

  return {
    next(count = 1) {
      const floats = takeFairnessFloats({
        serverSeed: payload.serverSeed,
        clientSeed: payload.clientSeed,
        nonce,
        count,
      });
      const used = nonce;
      nonce += 1;
      return {
        floats,
        nonce: used,
        clientSeed: payload.clientSeed,
        serverSeedHash: payload.serverSeedHash,
      };
    },
  };
};

export const buildFairnessVerification = ({
  gameKey,
  serverSeed,
  clientSeed,
  nonce,
  cursor = 0,
  rows = 12,
  mineCount = 3,
  length = 10,
}) => {
  const digest = deriveFairnessDigest({
    serverSeed,
    clientSeed,
    nonce,
    cursor: Math.floor(cursor / 32),
  });
  const [normalizedRoll] = takeFairnessFloats({
    serverSeed,
    clientSeed,
    nonce,
    count: 1,
    cursor,
  });

  if (gameKey === "plinko") {
    const plinko = derivePlinkoPath({
      serverSeed,
      clientSeed,
      nonce,
      rows,
    });
    return {
      gameKey,
      digest,
      normalizedRoll,
      result: plinko.bin,
      path: plinko.path,
      rows,
      serverSeedHash: hashServerSeed(serverSeed),
    };
  }

  if (gameKey === "mines") {
    const mines = deriveMinesLayout({
      serverSeed,
      clientSeed,
      nonce,
      mineCount,
    });
    return {
      gameKey,
      digest,
      normalizedRoll,
      result: mines,
      mineCount,
      serverSeedHash: hashServerSeed(serverSeed),
    };
  }

  if (gameKey === "wheel") {
    return {
      gameKey,
      digest,
      normalizedRoll,
      result: deriveOutcomeIndex(normalizedRoll, length),
      serverSeedHash: hashServerSeed(serverSeed),
    };
  }

  if (gameKey === "roulette") {
    const pocket = deriveRoulettePocket(normalizedRoll);
    return {
      gameKey,
      digest,
      normalizedRoll,
      result: pocket,
      pocket,
      serverSeedHash: hashServerSeed(serverSeed),
      formula: "floor(float × 37)",
    };
  }

  return {
    gameKey,
    digest,
    normalizedRoll,
    result: deriveGameResult({ gameKey, normalizedRoll }),
    serverSeedHash: hashServerSeed(serverSeed),
  };
};
