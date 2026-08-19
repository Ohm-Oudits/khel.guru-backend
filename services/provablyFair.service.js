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
    gameKey: "crash",
    title: "Crash",
    verificationMode: "seed-ready",
    defaultHouseEdgePercent: null,
    engineStatus: "pending-round-migration",
  },
  {
    gameKey: "mines",
    title: "Mines",
    verificationMode: "seed-ready",
    defaultHouseEdgePercent: null,
    engineStatus: "pending-round-migration",
  },
  {
    gameKey: "plinko",
    title: "Plinko",
    verificationMode: "seed-ready",
    defaultHouseEdgePercent: null,
    engineStatus: "pending-round-migration",
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

const deriveMultiplierResult = (normalizedRoll, houseEdgePercent = 1) => {
  const boundedRoll = Math.min(Math.max(normalizedRoll, 0), 0.999999999999);
  const multiplier =
    ((100 - houseEdgePercent) / 100) / (1 - boundedRoll);

  return Number(Math.max(1, multiplier).toFixed(2));
};

export const deriveGameResult = ({ gameKey, normalizedRoll }) => {
  if (gameKey === "dice") {
    return Number((normalizedRoll * 100).toFixed(2));
  }

  if (gameKey === "limbo" || gameKey === "slide") {
    return deriveMultiplierResult(normalizedRoll, 1);
  }

  return Number(normalizedRoll.toFixed(12));
};

export const buildFairnessVerification = ({
  gameKey,
  serverSeed,
  clientSeed,
  nonce,
  cursor = 0,
}) => {
  const { digest, normalizedRoll } = deriveNormalizedRoll({
    serverSeed,
    clientSeed,
    nonce,
    cursor,
  });

  return {
    gameKey,
    digest,
    normalizedRoll,
    result: deriveGameResult({ gameKey, normalizedRoll }),
    serverSeedHash: hashServerSeed(serverSeed),
  };
};
