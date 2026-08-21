import {
  TWIST_RING_MAX,
  TWIST_RING_VALUES,
} from "./twist.constants.js";

export const ringMultiplier = (color, progress) => {
  const values = TWIST_RING_VALUES[color];
  if (!values || progress <= 0) return 0;
  const idx = Math.min(progress, values.length) - 1;
  return values[idx];
};

export const boardMultiplier = ({ green = 0, orange = 0, purple = 0 }) =>
  ringMultiplier("green", green) +
  ringMultiplier("orange", orange) +
  ringMultiplier("purple", purple);

export const computeBoardPayout = (stake, progress) => {
  const amount = Number(stake) || 0;
  return Number((amount * boardMultiplier(progress)).toFixed(6));
};

export const clampRingProgress = (color, next) =>
  Math.max(0, Math.min(TWIST_RING_MAX[color], next));

export const reduceBoardProgress = ({ green = 0, orange = 0, purple = 0 }) => ({
  green: Math.max(0, green - 1),
  orange: Math.max(0, orange - 1),
  purple: Math.max(0, purple - 1),
});

export const applyTwistOutcome = (progress, outcome) => {
  const next = { ...progress };
  if (outcome === "green") {
    next.green = clampRingProgress("green", progress.green + 1);
  } else if (outcome === "orange") {
    next.orange = clampRingProgress("orange", progress.orange + 1);
  } else if (outcome === "purple") {
    next.purple = clampRingProgress("purple", progress.purple + 1);
  } else if (outcome === "skull") {
    next.green = Math.max(0, progress.green - 1);
    next.orange = Math.max(0, progress.orange - 1);
    next.purple = Math.max(0, progress.purple - 1);
  }
  return next;
};

export const buildTwistFairnessPayload = (session, extra = {}) => ({
  gameKey: "twist",
  nonce: session.nonce,
  clientSeed: session.clientSeed,
  serverSeedHash: session.serverSeedHash,
  outcome: session.lastOutcome,
  float: session.lastFloat,
  progress: {
    green: session.green,
    orange: session.orange,
    purple: session.purple,
  },
  boardMultiplier: boardMultiplier({
    green: session.green,
    orange: session.orange,
    purple: session.purple,
  }),
  ...extra,
});
