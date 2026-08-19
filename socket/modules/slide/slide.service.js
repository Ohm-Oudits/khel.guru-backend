import User from "../../../models/user.model.js";
import Game from "../../../models/game.model.js";
import { io } from "../../socket.js";
import {
  debitGameStake,
  creditGameWin,
  resolveGameWalletType,
} from "../../../services/casinoWallet.service.js";

const gameState = {
  isWaiting: true,
  currentRound: 0,
  timeLeft: 15,
  targetMultiplier: null,
  activeBets: new Map(),
  roundResults: [],
};

const resetGameState = () => {
  gameState.isWaiting = true;
  gameState.timeLeft = 15;
  gameState.targetMultiplier = null;
  gameState.activeBets.clear();
};

const generateMultiplier = () => {
  return parseFloat((Math.random() * 50 + 1).toFixed(2));
};

const service = {
  getActiveBetsCount() {
    return gameState.activeBets.size;
  },

  async join(userId) {
    try {
      const game = await Game.findOne({ name: "slide" });
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

      if (!gameState.gameLoop) {
        startGameLoop();
      }

      return {
        success: true,
        gameState: {
          isWaiting: gameState.isWaiting,
          timeLeft: gameState.timeLeft,
          currentRound: gameState.currentRound,
          roundResults: gameState.roundResults,
        },
      };
    } catch (error) {
      return { error: "An error occurred while joining the game" };
    }
  },

  async placeBet(userId, betData) {
    try {
      const { betAmount, targetMultiplier, walletType } = betData;

      if (
        !betAmount ||
        betAmount <= 0 ||
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

      // Debit the stake exactly once, when the bet enters the round.
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

      // Snapshot and clear the round's bets before settling: each bet is
      // settled exactly once even if this ever ran twice, and the stake was
      // already debited at place_bet so a loss credits nothing here.
      const settledBets = new Map(gameState.activeBets);
      gameState.activeBets.clear();

      for (const [userId, bet] of settledBets) {
        const { betAmount, targetMultiplier: betTarget, walletType } = bet;
        const isWin = Math.abs(betTarget - targetMultiplier) < 0.01;
        const winAmount = isWin ? betAmount * targetMultiplier : 0;

        // Total payout (stake x round multiplier) on a win; 0 is a no-op.
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

      gameState.currentRound++;
      return { success: true, targetMultiplier };
    } catch (error) {
      return { error: "An error occurred while processing round results" };
    }
  },
};

let gameLoopInterval;
const startGameLoop = () => {
  if (gameLoopInterval) return;

  gameLoopInterval = setInterval(async () => {
    if (gameState.isWaiting) {
      gameState.timeLeft--;

      if (gameState.timeLeft <= 0) {
        gameState.isWaiting = false;

        const result = await service.processRoundResults();
        if (result.success) {
          io.of("/slide").emit("round_result", {
            round: gameState.currentRound,
            multiplier: result.targetMultiplier,
            roundResults: gameState.roundResults,
          });
        }

        setTimeout(() => {
          resetGameState();
          io.of("/slide").emit("new_round", {
            round: gameState.currentRound,
            timeLeft: gameState.timeLeft,
          });
        }, 3000);
      } else {
        io.of("/slide").emit("time_update", {
          timeLeft: gameState.timeLeft,
        });
      }
    }
  }, 1000);
};

const cleanup = () => {
  if (gameLoopInterval) {
    clearInterval(gameLoopInterval);
    gameLoopInterval = null;
  }
  resetGameState();
};

export default service;
export { cleanup };
