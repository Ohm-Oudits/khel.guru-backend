import crypto from "node:crypto";
import { deriveTowerGridFromFloats } from "../socket/modules/tower/tower.fairness.js";
import {
  getTowerLevelConfig,
  TOWER_ROWS,
} from "../socket/modules/tower/tower.constants.js";
import { deriveTwistOutcome } from "../socket/modules/twist/twist.fairness.js";
import {
  TWIST_FAIRNESS_FORMULA,
  TWIST_OUTCOME_TABLE,
} from "../socket/modules/twist/twist.constants.js";
import {
  BACCARAT_EVENT_COUNT,
  CARD_FAIRNESS_FORMULA,
  HILO_BLACKJACK_EVENT_COUNT,
  cardsFromFloats,
} from "./cardFairness.js";
import {
  MINES_EVENT_COUNT,
  MINES_FAIRNESS_FORMULA,
  shuffleMinesFromFloats,
} from "../socket/modules/mines/mines.fairness.js";
import {
  getPlinkoTable,
  PLINKO_FAIRNESS_FORMULA,
} from "../socket/modules/plinko/plinko.payouts.js";
import {
  deriveScratchGridFromFloats,
  SCRATCH_FAIRNESS_FORMULA,
  SCRATCH_FLOAT_COUNT,
} from "../socket/modules/scratch/scratch.fairness.js";

export { shuffleMinesFromFloats, MINES_EVENT_COUNT, MINES_FAIRNESS_FORMULA };

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
    defaultHouseEdgePercent: 2,
    engineStatus: "seed-ready",
  },
  {
    gameKey: "parachute",
    title: "Parachute",
    verificationMode: "multiplier",
    defaultHouseEdgePercent: null,
    engineStatus: "seed-ready",
  },
  {
    gameKey: "pump",
    title: "Pump",
    verificationMode: "multiplier",
    defaultHouseEdgePercent: null,
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
    defaultHouseEdgePercent: 1,
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
    defaultHouseEdgePercent: 1,
    engineStatus: "seed-ready",
  },
  {
    gameKey: "tower",
    title: "Tower",
    verificationMode: "tower-layout",
    defaultHouseEdgePercent: null,
    engineStatus: "seed-ready",
  },
  {
    gameKey: "twist",
    title: "Twist",
    verificationMode: "twist-outcome",
    defaultHouseEdgePercent: null,
    engineStatus: "seed-ready",
  },
  {
    gameKey: "hilo",
    title: "Hilo",
    verificationMode: "card-stream",
    defaultHouseEdgePercent: null,
    engineStatus: "seed-ready",
  },
  {
    gameKey: "blackjack",
    title: "Blackjack",
    verificationMode: "card-stream",
    defaultHouseEdgePercent: null,
    engineStatus: "seed-ready",
  },
  {
    gameKey: "baccarat",
    title: "Baccarat",
    verificationMode: "card-stream",
    defaultHouseEdgePercent: 1.06,
    engineStatus: "seed-ready",
  },
  {
    gameKey: "keno",
    title: "Keno",
    verificationMode: "keno-hits",
    defaultHouseEdgePercent: null,
    engineStatus: "seed-ready",
  },
  {
    gameKey: "scratch",
    title: "Balloon Scratch",
    verificationMode: "scratch-grid",
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

export const takeFairnessBytes = ({
  serverSeed,
  clientSeed,
  nonce,
  count,
  cursor = 0,
}) => {
  const bytes = [];
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
    bytes.push(nextByte());
  }

  return bytes;
};

export const takeFairnessFloats = ({
  serverSeed,
  clientSeed,
  nonce,
  count,
  cursor = 0,
}) => {
  const bytes = takeFairnessBytes({
    serverSeed,
    clientSeed,
    nonce,
    count: count * 4,
    cursor,
  });
  const floats = [];
  for (let i = 0; i < count; i += 1) {
    floats.push(bytesToFloat(bytes.slice(i * 4, i * 4 + 4)));
  }
  return floats;
};

const HOUSE_EDGE = 0.01;

// Stake dice: 10,001 buckets covering 0.00 through 100.00.
export const deriveDiceRoll = (float) => Math.floor(float * 10001) / 100;

export const DICE_FAIRNESS_FORMULA =
  "HMAC_SHA256(serverSeed, clientSeed:nonce:round) → float u in [0,1). Roll = floor(u × 10001) / 100 covering 0.00–100.00. SHA256(serverSeed) is public until you rotate the pair.";

// Stake-style crash/pop: floor((rtp / float) * 100) / 100, min 1.00x.
export const deriveCrashPointFromRtp = (float, rtp = 0.99) => {
  if (!(float > 0)) return 1;
  const point = Number(rtp) / float;
  return Math.max(1, Math.floor(point * 100) / 100);
};

export const deriveCrashPoint = (float, houseEdge = HOUSE_EDGE) =>
  deriveCrashPointFromRtp(float, 1 - houseEdge);

export const deriveLimboMultiplier = (float) =>
  deriveCrashPointFromRtp(float, 0.99);

export const MULTIPLIER_RISK_RTP = {
  low: 0.99,
  medium: 0.8,
  high: 0.5,
};

export const normalizeMultiplierRisk = (risk) => {
  const key = String(risk || "low").trim().toLowerCase();
  if (key === "medium" || key === "med") return "medium";
  if (key === "high") return "high";
  return "low";
};

export const rtpForMultiplierRisk = (risk) =>
  MULTIPLIER_RISK_RTP[normalizeMultiplierRisk(risk)];

export const deriveRiskMultiplier = (float, risk = "low") =>
  deriveCrashPointFromRtp(float, rtpForMultiplierRisk(risk));

export const LIMBO_FAIRNESS_FORMULA =
  "HMAC_SHA256(serverSeed, clientSeed:nonce:round) → float u in [0,1). Result = max(1, floor((0.99 / u) × 100) / 100) (99% RTP).";

export const riskMultiplierFairnessFormula = (risk = "low") => {
  const level = normalizeMultiplierRisk(risk);
  const rtp = MULTIPLIER_RISK_RTP[level];
  const rtpLabel = rtp.toFixed(2);
  return `HMAC_SHA256(serverSeed, clientSeed:nonce:round) → float u in [0,1). Result = max(1, floor((${rtpLabel} / u) × 100) / 100). Low=0.99/u, Medium=0.80/u, High=0.50/u. Higher risk crashes earlier. This round: ${level} (${rtpLabel}/u).`;
};

export const CRASH_RTP = 0.99;
export const CRASH_HOUSE_EDGE = 0.01;
export const CRASH_ALT_RTP_PERCENTS = [40, 50, 60, 70, 80, 90];
export const CRASH_ALT_STREAK_MAX = 6;

export const crashAltStreakLength = (selector = 0) =>
  1 + (Number(selector) % CRASH_ALT_STREAK_MAX);

export const resolveCrashRtp = ({ alt = false, selector = 0 } = {}) => {
  if (!alt) {
    return {
      rtp: CRASH_RTP,
      rtpPercent: 99,
      alt: false,
      altIndex: null,
    };
  }
  const list = CRASH_ALT_RTP_PERCENTS;
  const altIndex = Number(selector) % list.length;
  const rtpPercent = list[altIndex];
  return {
    rtp: rtpPercent / 100,
    rtpPercent,
    alt: true,
    altIndex,
  };
};

export const crashFairnessFormula = (rtpPercent = 99) =>
  `A 99% round is followed by 1–6 HMAC-picked rounds from [0.40, 0.50, 0.60, 0.70, 0.80, 0.90], then 99% again. Streak length uses HMAC bytes 8–11 on the first alt round. Each alt RTP uses bytes 4–7. SHA256(serverSeed) is public while betting; RTP percent is public too. After crash, serverSeed is revealed. HMAC first 8 hex digits → N. C = max(1, floor((2^32 / (N + 1)) × rtp × 100) / 100). This round rtp=${Number(rtpPercent)}%. P(reach X) = rtp / X.`;

export const CRASH_FAIRNESS_FORMULA = crashFairnessFormula(99);

export const hmacInteger32FromBytes = (bytes = []) =>
  (((bytes[0] || 0) << 24) |
    ((bytes[1] || 0) << 16) |
    ((bytes[2] || 0) << 8) |
    (bytes[3] || 0)) >>>
  0;

/** Stake Crash: C = max(1, floor((2^32 / (N + 1)) × rtp × 100) / 100). */
export const deriveStakeCrashPoint = (n, rtp = CRASH_RTP) => {
  const point = (2 ** 32 / (Number(n) + 1)) * rtp;
  return Math.max(1, Math.floor(point * 100) / 100);
};

export const deriveStakeCrashPointFromBytes = (bytes, rtp = CRASH_RTP) =>
  deriveStakeCrashPoint(hmacInteger32FromBytes(bytes), rtp);

export const SLIDE_RTP = 0.98;
export const SLIDE_HOUSE_EDGE = 0.02;
export const SLIDE_FAIRNESS_FORMULA =
  "Per round: SHA256(serverSeed) is public while betting. After the result, serverSeed is revealed. HMAC_SHA256(serverSeed, clientSeed:nonce:round) → float u. Result = max(1, floor((0.98 / u) × 100) / 100). Win if result ≥ player target X; payout = stake × X. P(win) = 0.98 / X. A new seed is committed for the next round.";

export const deriveSlideMultiplier = (float) =>
  deriveCrashPoint(float, SLIDE_HOUSE_EDGE);

export const deriveOutcomeIndex = (float, length) => {
  if (!length) return 0;
  return Math.min(length - 1, Math.floor(float * length));
};

export const WHEEL_FAIRNESS_FORMULA =
  "HMAC_SHA256(serverSeed, clientSeed:nonce:round) → float u in [0,1). Index = floor(u × segments). Multiplier is the published risk table cell at that index. SHA256(serverSeed) is public until you rotate the pair.";

export const ROULETTE_FAIRNESS_FORMULA =
  "HMAC_SHA256(serverSeed, clientSeed:nonce:round) → float u in [0,1). Pocket = floor(u × 37) → European 0–36 (uniform 1/37). SHA256(serverSeed) is public until you rotate the pair.";

/** Stake roulette: floor(float × 37) → European pocket 0–36 (uniform 1/37 each). */
export const deriveRoulettePocket = (float) => deriveOutcomeIndex(float, 37);

export const KENO_EVENT_COUNT = 10;
export const KENO_SQUARES = Array.from({ length: 40 }, (_, i) => i + 1);
export const KENO_FAIRNESS_FORMULA =
  "HMAC_SHA256(serverSeed, clientSeed:nonce:round) → 10 floats → Fisher-Yates on [1..40]: hit = pool[floor(float × remaining)]";

export const drawKenoHitsFromFloats = (floats = []) => {
  const pool = KENO_SQUARES.slice();
  const hits = [];
  const count = Math.min(KENO_EVENT_COUNT, floats.length);
  for (let i = 0; i < count; i += 1) {
    const remaining = pool.length;
    const index = Math.min(
      remaining - 1,
      Math.floor((Number(floats[i]) || 0) * remaining)
    );
    hits.push(pool[index]);
    pool.splice(index, 1);
  }
  return hits;
};

export const deriveKenoHits = ({ serverSeed, clientSeed, nonce }) => {
  const floats = takeFairnessFloats({
    serverSeed,
    clientSeed,
    nonce,
    count: KENO_EVENT_COUNT,
  });
  return drawKenoHitsFromFloats(floats);
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
    count: MINES_EVENT_COUNT,
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
  const path = floats.map((value) => (value >= 0.5 ? 1 : 0));
  const bin = path.reduce((sum, step) => sum + step, 0);
  return { path, bin };
};

export {
  deriveTowerGridFromFloats,
  sanitizeTowerGridForClient,
} from "../socket/modules/tower/tower.fairness.js";

export {
  PLINKO_FAIRNESS_FORMULA,
  PLINKO_RTP,
  floatsToPlinkoPath,
  getPlinkoTable,
  pathToBin,
} from "../socket/modules/plinko/plinko.payouts.js";

export const deriveGameResult = ({
  gameKey,
  normalizedRoll,
  risk,
  difficulty,
}) => {
  if (gameKey === "dice") {
    return deriveDiceRoll(normalizedRoll);
  }

  if (gameKey === "limbo") {
    return deriveLimboMultiplier(normalizedRoll);
  }

  if (gameKey === "parachute") {
    return deriveRiskMultiplier(normalizedRoll, difficulty);
  }

  if (gameKey === "pump") {
    return deriveRiskMultiplier(normalizedRoll, risk);
  }

  if (gameKey === "slide") {
    return deriveSlideMultiplier(normalizedRoll);
  }

  if (gameKey === "twist") {
    return deriveTwistOutcome(normalizedRoll);
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
      const bytes = takeFairnessBytes({
        serverSeed: payload.serverSeed,
        clientSeed: payload.clientSeed,
        nonce,
        count: count * 4,
      });
      const floats = [];
      for (let i = 0; i < count; i += 1) {
        floats.push(bytesToFloat(bytes.slice(i * 4, i * 4 + 4)));
      }
      const used = nonce;
      nonce += 1;
      return {
        floats,
        bytes,
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
  difficulty,
  risk,
  alt = false,
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
    const table = getPlinkoTable(rows, risk || "Medium");
    return {
      gameKey,
      digest,
      normalizedRoll,
      result: plinko.bin,
      path: plinko.path,
      rows,
      risk: risk || "Medium",
      multiplier: table ? table[plinko.bin] : null,
      serverSeedHash: hashServerSeed(serverSeed),
      formula: PLINKO_FAIRNESS_FORMULA,
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
      count: MINES_EVENT_COUNT,
      serverSeedHash: hashServerSeed(serverSeed),
      formula: MINES_FAIRNESS_FORMULA,
    };
  }

  if (gameKey === "wheel") {
    return {
      gameKey,
      digest,
      normalizedRoll,
      result: deriveOutcomeIndex(normalizedRoll, length),
      length,
      risk,
      serverSeedHash: hashServerSeed(serverSeed),
      formula: WHEEL_FAIRNESS_FORMULA,
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
      formula: ROULETTE_FAIRNESS_FORMULA,
    };
  }

  if (gameKey === "tower") {
    const towerDifficulty = difficulty || "Easy";
    const { count: eggCount, multiplier: maxMultiplier } =
      getTowerLevelConfig(towerDifficulty);
    const floatCount = TOWER_ROWS * eggCount;
    const floats = takeFairnessFloats({
      serverSeed,
      clientSeed,
      nonce,
      count: floatCount,
    });
    const layout = deriveTowerGridFromFloats(floats, towerDifficulty);
    const sampleProgress = 1;
    const checkoutMultiplier = maxMultiplier * (sampleProgress / TOWER_ROWS);

    return {
      gameKey,
      digest,
      normalizedRoll,
      result: layout.eggLevels,
      grid: layout.grid,
      eggLevels: layout.eggLevels,
      cols: layout.cols,
      rows: layout.rows,
      eggCount,
      floatCount,
      difficulty: layout.difficulty,
      maxMultiplier,
      serverSeedHash: hashServerSeed(serverSeed),
      formula:
        "HMAC_SHA256(serverSeed, clientSeed:nonce:round) → floats → Fisher-Yates egg columns per row",
      payoutFormulas: {
        win: "betAmount × maxMultiplier",
        checkout: "betAmount × maxMultiplier × (progress / rows)",
        progress: "rows - currentRow - 1",
      },
      samplePayouts: {
        progress1: {
          progress: 1,
          multiplier: checkoutMultiplier,
        },
        fullWin: {
          progress: TOWER_ROWS,
          multiplier: maxMultiplier,
        },
      },
    };
  }

  if (gameKey === "twist") {
    const outcome = deriveTwistOutcome(normalizedRoll);
    return {
      gameKey,
      digest,
      normalizedRoll,
      result: outcome,
      outcome,
      table: TWIST_OUTCOME_TABLE,
      serverSeedHash: hashServerSeed(serverSeed),
      formula: TWIST_FAIRNESS_FORMULA,
    };
  }

  if (gameKey === "crash") {
    const n = Number.parseInt(digest.slice(0, 8), 16);
    const selector = Number.parseInt(digest.slice(8, 16), 16);
    const resolved = resolveCrashRtp({ alt, selector });
    const crashPoint = deriveStakeCrashPoint(n, resolved.rtp);
    return {
      gameKey,
      digest,
      normalizedRoll,
      n,
      result: crashPoint,
      crashPoint,
      rtp: resolved.rtp,
      rtpPercent: resolved.rtpPercent,
      alt: resolved.alt,
      serverSeedHash: hashServerSeed(serverSeed),
      formula: crashFairnessFormula(resolved.rtpPercent),
    };
  }

  if (gameKey === "keno") {
    const hits = deriveKenoHits({
      serverSeed,
      clientSeed,
      nonce,
    });
    return {
      gameKey,
      digest,
      normalizedRoll,
      result: hits,
      hits,
      count: KENO_EVENT_COUNT,
      serverSeedHash: hashServerSeed(serverSeed),
      formula: KENO_FAIRNESS_FORMULA,
    };
  }

  if (gameKey === "scratch") {
    const floats = takeFairnessFloats({
      serverSeed,
      clientSeed,
      nonce,
      count: SCRATCH_FLOAT_COUNT,
    });
    const grid = deriveScratchGridFromFloats(floats);
    const diamonds = grid.map((cell) => cell.diamondColor);
    return {
      gameKey,
      digest,
      normalizedRoll,
      result: diamonds,
      diamonds,
      balloons: grid.map((cell) => cell.balloonColor),
      count: SCRATCH_FLOAT_COUNT,
      serverSeedHash: hashServerSeed(serverSeed),
      formula: SCRATCH_FAIRNESS_FORMULA,
    };
  }

  if (
    gameKey === "hilo" ||
    gameKey === "blackjack" ||
    gameKey === "baccarat"
  ) {
    const count =
      gameKey === "baccarat"
        ? BACCARAT_EVENT_COUNT
        : HILO_BLACKJACK_EVENT_COUNT;
    const floats = takeFairnessFloats({
      serverSeed,
      clientSeed,
      nonce,
      count,
    });
    const cards = cardsFromFloats(floats);
    return {
      gameKey,
      digest,
      normalizedRoll,
      result: cards.map((card) => card.label),
      cards,
      count,
      hmacRounds: Math.ceil((count * 4) / 32),
      serverSeedHash: hashServerSeed(serverSeed),
      formula: CARD_FAIRNESS_FORMULA,
    };
  }

  const riskLevel =
    gameKey === "pump"
      ? risk || "Low"
      : gameKey === "parachute"
        ? difficulty || "low"
        : risk;

  return {
    gameKey,
    digest,
    normalizedRoll,
    result: deriveGameResult({
      gameKey,
      normalizedRoll,
      risk: riskLevel,
      difficulty: riskLevel,
    }),
    serverSeedHash: hashServerSeed(serverSeed),
    ...(gameKey === "slide" ? { formula: SLIDE_FAIRNESS_FORMULA } : {}),
    ...(gameKey === "dice" ? { formula: DICE_FAIRNESS_FORMULA } : {}),
    ...(gameKey === "limbo" ? { formula: LIMBO_FAIRNESS_FORMULA } : {}),
    ...(gameKey === "parachute" || gameKey === "pump"
      ? {
          formula: riskMultiplierFairnessFormula(riskLevel),
          rtp: rtpForMultiplierRisk(riskLevel),
          risk: normalizeMultiplierRisk(riskLevel),
        }
      : {}),
  };
};
