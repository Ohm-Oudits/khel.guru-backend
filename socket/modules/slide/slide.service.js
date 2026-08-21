import User from "../../../models/user.model.js";
import Game from "../../../models/game.model.js";
import { io } from "../../socket.js";
import {
  debitGameStake,
  creditGameWin,
  resolveGameWalletType,
} from "../../../services/casinoWallet.service.js";
import {
  createSeedRecordPayload,
  deriveSlideMultiplier,
  SLIDE_FAIRNESS_FORMULA,
  takeFairnessFloats,
} from "../../../services/provablyFair.service.js";
import { parseSlideTarget, settleSlideBet } from "./slide.payout.js";

const SLIDE_CLIENT_SEED = "slide-public";

const commitSlideRound = () => {
  const payload = createSeedRecordPayload({
    gameKey: "slide",
    clientSeed: SLIDE_CLIENT_SEED,
  });
  const [float] = takeFairnessFloats({
    serverSeed: payload.serverSeed,
    clientSeed: payload.clientSeed,
    nonce: 0,
    count: 1,
  });
  return {
    serverSeed: payload.serverSeed,
    serverSeedHash: payload.serverSeedHash,
    clientSeed: payload.clientSeed,
    nonce: 0,
    resultMultiplier: deriveSlideMultiplier(float),
  };
};

const publicCommitment = (round) => {
  if (!round) return null;
  return {
    clientSeed: round.clientSeed,
    nonce: round.nonce,
    serverSeedHash: round.serverSeedHash,
    formula: SLIDE_FAIRNESS_FORMULA,
  };
};

const publicReveal = (round) => {
  if (!round) return null;
  return {
    ...publicCommitment(round),
    serverSeed: round.serverSeed,
    resultMultiplier: round.resultMultiplier,
  };
};

let activeRound = commitSlideRound();
let revealedRound = null;

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
    fairness:
      gameState.phase === "result"
        ? publicReveal(revealedRound)
        : publicCommitment(activeRound),
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
  revealedRound = null;
  activeRound = commitSlideRound();
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

      const { betAmount, walletType, targetMultiplier } = betData;
      const playerTarget = parseSlideTarget(targetMultiplier);
      if (playerTarget == null) {
        return { error: "Invalid target multiplier" };
      }

      if (
        betAmount == null ||
        Number.isNaN(Number(betAmount)) ||
        Number(betAmount) < 0
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
        walletType: resolvedWalletType,
        targetMultiplier: playerTarget,
        timestamp: Date.now(),
      });

      return { success: true, newBalance: debit.balance };
    } catch (error) {
      return { error: "An error occurred while placing bet" };
    }
  },

  async processRoundResults() {
    try {
      const round = activeRound;
      if (!round) {
        return { error: "Slide round was not committed" };
      }
      const resultMultiplier = round.resultMultiplier;
      revealedRound = round;
      gameState.targetMultiplier = resultMultiplier;

      const settledBets = new Map(gameState.activeBets);
      gameState.activeBets.clear();

      for (const [userId, bet] of settledBets) {
        const { betAmount, walletType, targetMultiplier } = bet;
        const settlement = settleSlideBet({
          betAmount,
          targetMultiplier,
          resultMultiplier,
        });

        const credit = await creditGameWin(userId, {
          gameKey: "slide",
          amount: settlement.payout,
          walletType: walletType || "demo",
        });

        io.of("/slide")
          .to(`slide:${userId}`)
          .emit("bet_result", {
            round: gameState.currentRound,
            multiplier: resultMultiplier,
            targetMultiplier,
            betAmount,
            isWin: settlement.isWin,
            winAmount: settlement.payout,
            newBalance: credit.balance,
            walletType: walletType || "demo",
            nonce: round.nonce,
            clientSeed: round.clientSeed,
            serverSeedHash: round.serverSeedHash,
            serverSeed: round.serverSeed,
            fairness: publicReveal(round),
          });
      }

      gameState.roundResults.unshift({
        round: gameState.currentRound,
        multiplier: resultMultiplier,
        timestamp: Date.now(),
      });
      if (gameState.roundResults.length > 10) {
        gameState.roundResults.pop();
      }

      return {
        success: true,
        targetMultiplier: resultMultiplier,
        round: gameState.currentRound,
        fairness: publicReveal(round),
      };
    } catch (error) {
      return { error: "An error occurred while processing round results" };
    }
  },
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
          fairness: result.fairness,
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
