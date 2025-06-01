import User from "../../../models/user.model.js";
import Game from "../../../models/game.model.js";
import mongoose from "mongoose";

const service = {
  async join(userId) {
    try {
      const game = await Game.findOne({ name: "limbo" });
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
      return { success: true };
    } catch (error) {
      return { error: "An error occurred while joining the game" };
    }
  },

  async placeBet(userId, betAmount, targetMultiplier) {
    try {
      const user = await User.findById(userId);
      if (!user) {
        return { error: "User not found" };
      }

      // Check if user has enough balance
      if (user.balance < betAmount) {
        return { error: "Insufficient balance" };
      }

      // Generate random number between 1 and 100
      const randomNumber = (Math.random() * 99 + 1).toFixed(2);
      const isWin = parseFloat(randomNumber) > targetMultiplier;

      // Calculate winnings
      const winAmount = isWin ? betAmount * targetMultiplier : 0;
      const profit = winAmount - betAmount;

      // Update user balance
      user.balance = user.balance - betAmount + winAmount;

      // Create game record
      const gameRecord = {
        userId: new mongoose.Types.ObjectId(userId),
        gameType: "limbo",
        betAmount,
        targetMultiplier,
        result: randomNumber,
        isWin,
        profit,
        timestamp: new Date(),
      };

      // Save game record and update user
      await Promise.all([
        user.save(),
        Game.findOneAndUpdate(
          { name: "limbo" },
          { $push: { history: gameRecord } }
        ),
      ]);

      return {
        success: true,
        result: {
          number: randomNumber,
          isWin,
          profit,
          newBalance: user.balance,
        },
      };
    } catch (error) {
      console.error("Error in placeBet:", error);
      return { error: "An error occurred while placing bet" };
    }
  },

  async checkout() {
    try {
      console.log("Checkout");
    } catch (error) {
      return { error: "An error occurred while checkout the game" };
    }
  },
};

export default service;
