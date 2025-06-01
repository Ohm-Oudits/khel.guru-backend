import User from "../../../models/user.model.js";
import Game from "../../../models/game.model.js";
import parachuteGame from "./parachute.game.js";

const service = {
  async join(userId, betAmount, difficulty) {
    try {
      const game = await Game.findOne({ name: "parachute" });
      if (!game) {
        return { error: "Game not found" };
      }

      const user = await User.findById(userId);
      if (!user) {
        return { error: "User not found" };
      }

      // Check if user has sufficient balance
      if (user.balance < betAmount) {
        return { error: "Insufficient balance" };
      }

      // Deduct bet amount from user balance
      user.balance -= betAmount;

      // Update user's game history
      const gameIndex = user.continuedGames.findIndex(
        (gameId) => gameId.toString() === game._id.toString()
      );

      if (gameIndex !== -1) {
        user.continuedGames.splice(gameIndex, 1);
      }
      user.continuedGames.unshift(game._id);
      game.gamesPlayed = game.gamesPlayed + 1;

      // Start the game
      const gameResult = parachuteGame.startGame(userId, betAmount, difficulty);
      if (gameResult.error) {
        // Refund the bet if game start failed
        user.balance += betAmount;
        await user.save();
        return gameResult;
      }

      await user.save();
      await game.save();

      return {
        success: true,
        gameState: gameResult.gameState,
      };
    } catch (error) {
      console.error("Join game error:", error);
      return { error: "An error occurred while joining the game" };
    }
  },

  async checkout(userId) {
    try {
      const user = await User.findById(userId);
      if (!user) {
        return { error: "User not found" };
      }

      const gameState = parachuteGame.getGameState(userId);
      if (!gameState) {
        return { error: "No active game found" };
      }

      const checkoutResult = parachuteGame.checkout(userId);
      if (checkoutResult.error) {
        return checkoutResult;
      }

      // Update user balance with winnings
      user.balance += checkoutResult.winAmount;
      await user.save();

      return {
        success: true,
        ...checkoutResult,
      };
    } catch (error) {
      console.error("Checkout error:", error);
      return { error: "An error occurred during checkout" };
    }
  },

  async handleCrash(userId) {
    try {
      const gameState = parachuteGame.getGameState(userId);
      if (!gameState) {
        return { error: "No active game found" };
      }

      const finalState = parachuteGame.stopGame(userId);
      if (!finalState) {
        return { error: "Failed to process crash" };
      }

      // Update user statistics if needed
      const user = await User.findById(userId);
      if (user) {
        // You might want to update user statistics here
        // For example: total games played, total losses, etc.
        await user.save();
      }

      return {
        success: true,
        ...finalState,
      };
    } catch (error) {
      console.error("Crash handling error:", error);
      return { error: "An error occurred while processing crash" };
    }
  },
};

export default service;
