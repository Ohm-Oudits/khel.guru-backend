import User from "../../../models/user.model.js";
import Game from "../../../models/game.model.js";
import { io } from "../../socket.js";
import {
  debitGameStake,
  creditGameWin,
  getGameBalance,
} from "../../../services/casinoWallet.service.js";
import {
  crashCashoutPayout,
  parseCrashAutoTarget,
} from "./crash.payout.js";
import { commitCrashRound, publicCrashFairness } from "./crash.fairness.js";

const activeBets = new Map();

const GROWTH_K = 18;
const TICK_MS = 80;
const WAIT_MS = 5000;
const CRASHED_MS = 2500;
const HISTORY_MAX = 20;

const gameState = {
  phase: "waiting",
  round: 1,
  phaseStartedAt: Date.now(),
  crashPoint: 1,
  pending: null,
  active: null,
  revealed: null,
  history: [],
  lastEmitted: 0,
  rtpPhase: "base",
  altRemaining: 0,
  altStreakLength: 0,
};

const currentMultiplier = () => {
  if (gameState.phase === "waiting") return 1;
  const elapsedSec = (Date.now() - gameState.phaseStartedAt) / 1000;
  const live = Math.exp(elapsedSec / GROWTH_K);
  if (gameState.phase === "crashed") return gameState.crashPoint;
  return Math.min(gameState.crashPoint, live);
};

const currentRound = () =>
  gameState.phase === "waiting" ? gameState.pending : gameState.active;

const publicFairness = () =>
  publicCrashFairness({
    phase: gameState.phase,
    currentRound: currentRound(),
    revealedRound: gameState.revealed,
  });

const snapshot = () => ({
  phase: gameState.phase,
  round: gameState.round,
  multiplier: Number(currentMultiplier().toFixed(2)),
  elapsedMs: Date.now() - gameState.phaseStartedAt,
  remainingMs:
    gameState.phase === "waiting"
      ? Math.max(0, WAIT_MS - (Date.now() - gameState.phaseStartedAt))
      : gameState.phase === "crashed"
        ? Math.max(0, CRASHED_MS - (Date.now() - gameState.phaseStartedAt))
        : 0,
  crashPoint: gameState.phase === "crashed" ? gameState.crashPoint : null,
  fairness: publicFairness(),
  history: gameState.history,
  serverNow: Date.now(),
});

const emitState = () => {
  io.of("/crash").emit("round_state", snapshot());
};

const commitUpcomingRound = () => {
  const startStreak =
    gameState.rtpPhase === "alt" && gameState.altRemaining === 0;
  const continuingAlt =
    gameState.rtpPhase === "alt" && gameState.altRemaining > 0;

  const pending = commitCrashRound({
    nonce: gameState.round,
    alt: gameState.rtpPhase === "alt",
    startStreak,
    streakLength: continuingAlt ? gameState.altStreakLength : null,
    streakIndex: continuingAlt
      ? gameState.altStreakLength - gameState.altRemaining + 1
      : null,
  });

  if (startStreak) {
    gameState.altStreakLength = pending.streakLength;
    gameState.altRemaining = pending.streakLength;
  }

  gameState.pending = pending;
};

const advanceRtpSchedule = (finished) => {
  if (!finished) return;
  if (finished.alt) {
    gameState.altRemaining = Math.max(0, gameState.altRemaining - 1);
    gameState.rtpPhase = gameState.altRemaining > 0 ? "alt" : "base";
    if (gameState.rtpPhase === "base") {
      gameState.altStreakLength = 0;
    }
    return;
  }
  gameState.rtpPhase = "alt";
  gameState.altRemaining = 0;
  gameState.altStreakLength = 0;
};

const beginRunning = () => {
  if (!gameState.pending) {
    commitUpcomingRound();
  }
  gameState.active = gameState.pending;
  gameState.pending = null;
  gameState.crashPoint = gameState.active.crashPoint;
  gameState.phase = "running";
  gameState.phaseStartedAt = Date.now();
  emitState();
};

const beginCrashed = async () => {
  gameState.phase = "crashed";
  gameState.phaseStartedAt = Date.now();
  gameState.revealed = {
    nonce: gameState.active.nonce,
    clientSeed: gameState.active.clientSeed,
    serverSeedHash: gameState.active.serverSeedHash,
    serverSeed: gameState.active.serverSeed,
    n: gameState.active.n,
    crashPoint: gameState.active.crashPoint,
    rtp: gameState.active.rtp,
    rtpPercent: gameState.active.rtpPercent,
    alt: gameState.active.alt,
    streakLength: gameState.active.streakLength ?? null,
    streakIndex: gameState.active.streakIndex ?? null,
  };
  gameState.history = [
    {
      id: Date.now(),
      value: gameState.crashPoint,
      timestamp: new Date().toISOString(),
      fairness: { ...gameState.revealed },
    },
    ...gameState.history,
  ].slice(0, HISTORY_MAX);

  const pending = [...activeBets.keys()];
  for (const userId of pending) {
    const result = await service.bust(userId);
    io.of("/crash").to(`crash:${userId}`).emit("bet_busted", {
      newBalance: result.newBalance ?? null,
      multiplier: gameState.crashPoint,
    });
  }

  emitState();
};

const beginWaiting = ({ first = false } = {}) => {
  if (!first) {
    advanceRtpSchedule(gameState.active);
    gameState.round += 1;
  }
  gameState.phase = "waiting";
  gameState.phaseStartedAt = Date.now();
  commitUpcomingRound();
  emitState();
};

const emitCashout = (userId, result) => {
  io.of("/crash").to(`crash:${userId}`).emit("cashout_success", {
    multiplier: result.multiplier,
    payout: result.payout,
    newBalance: result.newBalance,
    walletType: result.walletType,
  });
};

const maybeAutoCashouts = async () => {
  const live = Number(currentMultiplier().toFixed(2));
  const pending = [...activeBets.entries()];
  for (const [userId, bet] of pending) {
    const target = Number(bet.autoCashoutAt);
    if (!Number.isFinite(target) || target < 1.01) continue;
    if (live < target) continue;
    if (target >= gameState.crashPoint) continue;
    const result = await service.cashOut(userId, { atMultiplier: target });
    if (result.success) {
      emitCashout(userId, result);
    }
  }
};

let loopTimer = null;
const tick = async () => {
  if (gameState.phase === "running") {
    if (currentMultiplier() >= gameState.crashPoint) {
      await beginCrashed();
      return;
    }
    await maybeAutoCashouts();
    const now = Date.now();
    if (now - gameState.lastEmitted >= TICK_MS) {
      gameState.lastEmitted = now;
      emitState();
    }
    return;
  }

  if (gameState.phase === "crashed") {
    if (Date.now() - gameState.phaseStartedAt >= CRASHED_MS) {
      beginWaiting();
    }
    return;
  }

  if (gameState.phase === "waiting") {
    if (Date.now() - gameState.phaseStartedAt >= WAIT_MS) {
      beginRunning();
    }
  }
};

const startGameLoop = () => {
  if (loopTimer) return;
  beginWaiting({ first: true });
  loopTimer = setInterval(() => {
    tick().catch((err) => console.error("Crash loop error:", err));
  }, 50);
};

const cleanup = () => {
  if (loopTimer) {
    clearInterval(loopTimer);
    loopTimer = null;
  }
};

const service = {
  getSnapshot: snapshot,
  startLoop: startGameLoop,

  async join(userId) {
    try {
      const game = await Game.findOne({ name: "crash" });
      if (!game) {
        return { error: "Game not found" };
      }

      const user = await User.findById(userId);
      if (!user) {
        return { error: "User not found" };
      }

      const gameIndex = user.continuedGames.findIndex(
        (gameId) => gameId.toString() === game._id.toString()
      );

      if (gameIndex !== -1) {
        user.continuedGames.splice(gameIndex, 1);
      }
      user.continuedGames.unshift(game._id);
      game.gamesPlayed = game.gamesPlayed + 1;

      await user.save();
      await game.save();
      startGameLoop();
      return { success: true, gameState: snapshot() };
    } catch (error) {
      return { error: "An error occurred while joining the game" };
    }
  },

  async placeBet(userId, betAmount, walletType = "demo", autoCashoutAt = null) {
    if (gameState.phase !== "waiting") {
      return { error: "Betting is closed for this round" };
    }
    if (activeBets.has(userId)) {
      return { error: "You already have a bet in this round" };
    }

    const debit = await debitGameStake(userId, {
      gameKey: "crash",
      amount: betAmount,
      walletType,
    });
    if (debit.error) {
      return { error: debit.error };
    }

    activeBets.set(userId, {
      betAmount: debit.stake,
      walletType,
      autoCashoutAt: parseCrashAutoTarget(autoCashoutAt),
    });
    return {
      success: true,
      betAmount: debit.stake,
      newBalance: debit.balance,
      walletType,
      autoCashoutAt: parseCrashAutoTarget(autoCashoutAt),
    };
  },

  async cashOut(userId, { atMultiplier } = {}) {
    const bet = activeBets.get(userId);
    if (!bet) {
      return { error: "No active bet to cash out" };
    }
    if (gameState.phase !== "running") {
      return { error: "Cashout is only available while the round is running" };
    }

    let cashoutMultiplier = Number(currentMultiplier().toFixed(2));
    const requested = Number(atMultiplier);
    const autoAt = Number(bet.autoCashoutAt);
    if (
      Number.isFinite(requested) &&
      Number.isFinite(autoAt) &&
      requested === autoAt &&
      requested >= 1.01 &&
      requested <= cashoutMultiplier
    ) {
      cashoutMultiplier = autoAt;
    }

    if (!Number.isFinite(cashoutMultiplier) || cashoutMultiplier < 1) {
      return { error: "Invalid cashout multiplier" };
    }
    if (cashoutMultiplier >= gameState.crashPoint) {
      return { error: "Round already crashed" };
    }

    activeBets.delete(userId);

    const payout = crashCashoutPayout(bet.betAmount, cashoutMultiplier);
    const credit = await creditGameWin(userId, {
      gameKey: "crash",
      amount: payout,
      walletType: bet.walletType,
    });

    return {
      success: true,
      multiplier: cashoutMultiplier,
      payout,
      newBalance: credit.balance,
      walletType: bet.walletType,
    };
  },

  async bust(userId) {
    const bet = activeBets.get(userId);
    if (!bet) {
      return { success: true, hadBet: false };
    }

    activeBets.delete(userId);
    const newBalance = await getGameBalance(userId, bet.walletType);
    return { success: true, hadBet: true, newBalance, walletType: bet.walletType };
  },

  clearBet(userId) {
    activeBets.delete(userId);
  },
};

export default service;
export { cleanup, startGameLoop };
