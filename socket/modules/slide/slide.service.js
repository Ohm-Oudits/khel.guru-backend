import User from "../../../models/user.model.js";
import Game from "../../../models/game.model.js";
import { io } from "../../socket.js";

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
      const { betAmount, targetMultiplier } = betData;

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

      if (user.balance < betAmount) {
        return { error: "Insufficient balance" };
      }

      if (!gameState.isWaiting) {
        return { error: "Betting is closed" };
      }

      gameState.activeBets.set(userId, {
        betAmount,
        targetMultiplier,
        timestamp: Date.now(),
      });

      return { success: true };
    } catch (error) {
      return { error: "An error occurred while placing bet" };
    }
  },

  async processRoundResults() {
    try {
      const targetMultiplier = generateMultiplier();
      gameState.targetMultiplier = targetMultiplier;

      for (const [userId, bet] of gameState.activeBets) {
        const user = await User.findById(userId);
        if (!user) continue;

        const { betAmount, targetMultiplier: betTarget } = bet;
        const isWin = Math.abs(betTarget - targetMultiplier) < 0.01;
        const winAmount = isWin ? betAmount * targetMultiplier : 0;

        user.balance += winAmount - betAmount;
        await user.save();
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
