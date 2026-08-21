import User from "../../../models/user.model.js";
import Game from "../../../models/game.model.js";
import { io } from "../../socket.js";
import {
  debitGameStake,
  creditGameWin,
  resolveGameWalletType,
} from "../../../services/casinoWallet.service.js";
import { createHouseStream, deriveCrashPoint } from "../../../services/provablyFair.service.js";

const WAIT_MS = 5_000;
const SPIN_MS = 5_000;
const RESULT_MS = 8_000;

const gameState = {
  isWaiting: true,
  phase: "waiting",
  currentRound: 1,
  phaseStartedAt: Date.now(),
  targetMultiplier: null,
  activeBets: new Map(),
  roundResults: [],
};

const phaseDuration = (phase) => {
  if (phase === "spinning") return SPIN_MS;
  if (phase === "result") return RESULT_MS;
  return WAIT_MS;
};

const remainingMs = () =>
  Math.max(0, phaseDuration(gameState.phase) - (Date.now() - gameState.phaseStartedAt));

const snapshot = () => {
  const remain = remainingMs();
  return {
    isWaiting: gameState.isWaiting,
    phase: gameState.phase,
    timeLeft: Math.ceil(remain / 1000),
    remainingMs: remain,
    elapsedMs: Date.now() - gameState.phaseStartedAt,
    currentRound: gameState.currentRound,
    roundResults: gameState.roundResults,
    targetMultiplier: gameState.targetMultiplier,
    totalBets: gameState.activeBets.size,
    serverNow: Date.now(),
    waitMs: WAIT_MS,
    spinMs: SPIN_MS,
    resultMs: RESULT_MS,
  };
};

const beginPhase = (phase) => {
  gameState.phase = phase;
  gameState.phaseStartedAt = Date.now();
  gameState.isWaiting = phase === "waiting";
};

const resetToWaiting = () => {
  gameState.currentRound += 1;
  gameState.targetMultiplier = null;
  gameState.activeBets.clear();
  beginPhase("waiting");
};

const service = {
  getActiveBetsCount() {
    return gameState.activeBets.size;
  },

  getSnapshot: snapshot,

  startLoop: () => startGameLoop(),

  async join(userId) {
    try {
      const game = await Game.findOne({ name: "slide" });
      if (!game) {
        return { error: "Game not found" };
      }

      if (userId) {
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
      }

      startGameLoop();

      return {
        success: true,
        gameState: snapshot(),
      };
    } catch (error) {
      return { error: "An error occurred while joining the game" };
    }
  },

  async placeBet(userId, betData) {
    try {
      if (!userId) {
        return { error: "Authentication required" };
      }

      const { betAmount, targetMultiplier, walletType } = betData;

      if (
        betAmount == null ||
        Number.isNaN(Number(betAmount)) ||
        Number(betAmount) < 0 ||
        !targetMultiplier ||
        targetMultiplier < 1 ||
        targetMultiplier > 51
      ) {
        return { error: "Invalid bet parameters" };
      }

      const user = await User.findById(userId);
      if (!user) {
        return { error: "User not found" };
      }

      if (!gameState.isWaiting) {
        return { error: "Betting is closed" };
      }

      // One bet per user per round: the Map is keyed by userId, so a second
      // place_bet would silently overwrite (and orphan) an already-debited
      // stake. Reject it instead, keeping the debit exactly-once.
      if (gameState.activeBets.has(userId)) {
        return { error: "Bet already placed for this round" };
      }

      const resolvedWalletType = resolveGameWalletType(walletType);

      const debit = await debitGameStake(userId, {
        gameKey: "slide",
        amount: betAmount,
        walletType: resolvedWalletType,
      });
      if (debit.error) {
        return { error: debit.error };
      }

      gameState.activeBets.set(userId, {
        betAmount: debit.stake,
        targetMultiplier,
        walletType: resolvedWalletType,
        timestamp: Date.now(),
      });

      return { success: true, newBalance: debit.balance };
    } catch (error) {
      return { error: "An error occurred while placing bet" };
    }
  },

  async processRoundResults() {
    try {
      const targetMultiplier = generateMultiplier();
      gameState.targetMultiplier = targetMultiplier;

      const settledBets = new Map(gameState.activeBets);
      gameState.activeBets.clear();

      for (const [userId, bet] of settledBets) {
        const { betAmount, targetMultiplier: betTarget, walletType } = bet;
        const isWin = Math.abs(betTarget - targetMultiplier) < 0.01;
        const winAmount = isWin ? betAmount * targetMultiplier : 0;

        const credit = await creditGameWin(userId, {
          gameKey: "slide",
          amount: winAmount,
          walletType: walletType || "demo",
        });

        io.of("/slide")
          .to(`slide:${userId}`)
          .emit("bet_result", {
            round: gameState.currentRound,
            multiplier: targetMultiplier,
            betAmount,
            targetMultiplier: betTarget,
            isWin,
            winAmount,
            newBalance: credit.balance,
            walletType: walletType || "demo",
          });
      }

      gameState.roundResults.unshift({
        round: gameState.currentRound,
        multiplier: targetMultiplier,
        timestamp: Date.now(),
      });
      if (gameState.roundResults.length > 10) {
        gameState.roundResults.pop();
      }

      return { success: true, targetMultiplier, round: gameState.currentRound };
    } catch (error) {
      return { error: "An error occurred while processing round results" };
    }
  },
};

const houseStream = createHouseStream("slide");

const generateMultiplier = () => {
  const { floats } = houseStream.next(1);
  return Math.min(50, deriveCrashPoint(floats[0]));
};

let gameLoopInterval;
const startGameLoop = () => {
  if (gameLoopInterval) return;

  gameLoopInterval = setInterval(async () => {
    if (remainingMs() > 0) {
      if (gameState.phase === "waiting") {
        const secs = Math.ceil(remainingMs() / 1000);
        if (secs !== gameState.lastEmittedSecond) {
          gameState.lastEmittedSecond = secs;
          io.of("/slide").emit("time_update", snapshot());
        }
      }
      return;
    }

    if (gameState.phase === "waiting") {
      beginPhase("spinning");
      io.of("/slide").emit("round_start", snapshot());
      return;
    }

    if (gameState.phase === "spinning") {
      const result = await service.processRoundResults();
      beginPhase("result");
      if (result.success) {
        io.of("/slide").emit("round_result", {
          ...snapshot(),
          multiplier: result.targetMultiplier,
          round: result.round,
        });
      }
      return;
    }

    if (gameState.phase === "result") {
      resetToWaiting();
      io.of("/slide").emit("new_round", snapshot());
    }
  }, 250);
};

const cleanup = () => {
  if (gameLoopInterval) {
    clearInterval(gameLoopInterval);
    gameLoopInterval = null;
  }
};

export default service;
export { cleanup, startGameLoop, WAIT_MS, SPIN_MS, RESULT_MS };
