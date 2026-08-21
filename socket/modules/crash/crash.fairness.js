import {
  createSeedRecordPayload,
  crashAltStreakLength,
  crashFairnessFormula,
  deriveStakeCrashPoint,
  hmacInteger32FromBytes,
  resolveCrashRtp,
  takeFairnessBytes,
} from "../../../services/provablyFair.service.js";

export const CRASH_PUBLIC_CLIENT_SEED = "crash-public";

/** New server seed per round. Hash + RTP percent are public during betting; seed is revealed only after crash. */
export const commitCrashRound = ({
  nonce = 0,
  alt = false,
  startStreak = false,
  streakLength = null,
  streakIndex = null,
} = {}) => {
  const payload = createSeedRecordPayload({
    gameKey: "crash",
    clientSeed: CRASH_PUBLIC_CLIENT_SEED,
  });
  const bytes = takeFairnessBytes({
    serverSeed: payload.serverSeed,
    clientSeed: payload.clientSeed,
    nonce,
    count: startStreak ? 12 : 8,
  });
  const n = hmacInteger32FromBytes(bytes);
  const selector = hmacInteger32FromBytes(bytes.slice(4, 8));
  const resolved = resolveCrashRtp({ alt, selector });
  const crashPoint = deriveStakeCrashPoint(n, resolved.rtp);
  const resolvedStreakLength = startStreak
    ? crashAltStreakLength(hmacInteger32FromBytes(bytes.slice(8, 12)))
    : streakLength;
  const resolvedStreakIndex = startStreak ? 1 : streakIndex;

  return {
    serverSeed: payload.serverSeed,
    serverSeedHash: payload.serverSeedHash,
    clientSeed: payload.clientSeed,
    nonce,
    n,
    selector,
    crashPoint,
    ...resolved,
    streakLength: resolved.alt ? resolvedStreakLength : null,
    streakIndex: resolved.alt ? resolvedStreakIndex : null,
    formula: crashFairnessFormula(resolved.rtpPercent),
  };
};

const commitmentOf = (round) => {
  if (!round) return null;
  return {
    nonce: round.nonce,
    clientSeed: round.clientSeed,
    serverSeedHash: round.serverSeedHash,
    rtp: round.rtp,
    rtpPercent: round.rtpPercent,
    alt: round.alt,
    streakLength: round.streakLength ?? null,
    streakIndex: round.streakIndex ?? null,
  };
};

const proofOf = (round) => {
  if (!round?.serverSeed) return null;
  return {
    ...commitmentOf(round),
    serverSeed: round.serverSeed,
    n: round.n,
    crashPoint: round.crashPoint,
    formula: round.formula,
  };
};

/**
 * Waiting/running: hash + nonce + RTP percent only.
 * Crashed: full proof (raw server seed, N, C).
 * `revealed` is the last finished round so waiting can still be verified.
 */
export const publicCrashFairness = ({
  phase,
  currentRound,
  revealedRound = null,
} = {}) => {
  const current = commitmentOf(currentRound);
  const revealed =
    phase === "crashed" ? proofOf(currentRound) : proofOf(revealedRound);

  if (!current && !revealed) return null;

  return {
    ...(current || {}),
    ...(phase === "crashed" ? proofOf(currentRound) || {} : {}),
    revealed: revealed || null,
  };
};
