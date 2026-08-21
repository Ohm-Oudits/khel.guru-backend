import User from "../../../models/user.model.js";
import Game from "../../../models/game.model.js";
import { io } from "../../socket.js";
import {
  debitGameStake,
  creditGameWin,
  getGameBalance,
} from "../../../services/casinoWallet.service.js";
import {
  createHouseStream,
  deriveCrashPoint,
} from "../../../services/provablyFair.service.js";

const activeBets = new Map();
const houseStream = createHouseStream("crash");

const GROWTH_K = 18;
const TICK_MS = 80;
const WAIT_MS = 5000;
const CRASHED_MS = 2500;
const HISTORY_MAX = 20;

const gameState = {
  phase: "running",
  round: 1,
  phaseStartedAt: Date.now(),
  crashPoint: 1,
  history: [],
  lastEmitted: 0,
};

const currentMultiplier = () => {
  if (gameState.phase === "waiting") return 1;
  const elapsedSec = (Date.now() - gameState.phaseStartedAt) / 1000;
  const live = Math.exp(elapsedSec / GROWTH_K);
  if (gameState.phase === "crashed") return gameState.crashPoint;
  return Math.min(gameState.crashPoint, live);
};

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
  crashPoint:
    gameState.phase === "crashed" ? gameState.crashPoint : null,
  history: gameState.history,
  serverNow: Date.now(),
});

const emitState = () => {
  io.of("/crash").emit("round_state", snapshot());
};

const beginRunning = () => {
  const { floats } = houseStream.next(1);
  gameState.crashPoint = deriveCrashPoint(floats[0]);
  gameState.phase = "running";
  gameState.phaseStartedAt = Date.now();
  emitState();
};

const beginCrashed = async () => {
  gameState.phase = "crashed";
  gameState.phaseStartedAt = Date.now();
  gameState.history = [
    {
      id: Date.now(),
      value: gameState.crashPoint,
      timestamp: new Date().toISOString(),
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

const beginWaiting = () => {
  gameState.round += 1;
  gameState.phase = "waiting";
  gameState.phaseStartedAt = Date.now();
  emitState();
};

let loopTimer = null;
const tick = async () => {
  if (gameState.phase === "running") {
    if (currentMultiplier() >= gameState.crashPoint) {
      await beginCrashed();
      return;
    }
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
  beginRunning();
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

  async placeBet(userId, betAmount, walletType = "demo") {
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

    activeBets.set(userId, { betAmount: debit.stake, walletType });
    return { success: true, betAmount: debit.stake, newBalance: debit.balance, walletType };
  },

  async cashOut(userId) {
    const bet = activeBets.get(userId);
    if (!bet) {
      return { error: "No active bet to cash out" };
    }
    if (gameState.phase !== "running") {
      return { error: "Cashout is only available while the round is running" };
    }

    const cashoutMultiplier = Number(currentMultiplier().toFixed(2));
    if (!Number.isFinite(cashoutMultiplier) || cashoutMultiplier < 1) {
      return { error: "Invalid cashout multiplier" };
    }

    activeBets.delete(userId);

    const payout = bet.betAmount * cashoutMultiplier;
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
