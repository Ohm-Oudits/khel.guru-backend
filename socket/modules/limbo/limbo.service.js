import User from "../../../models/user.model.js";
import Game from "../../../models/game.model.js";
import mongoose from "mongoose";
import {
  debitGameStake,
  creditGameWin,
} from "../../../services/casinoWallet.service.js";

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

  async placeBet(userId, betAmount, targetMultiplier, walletType = "demo") {
    try {
      // Debit the stake from the wallet first; a losing bet keeps this debit.
      const debit = await debitGameStake(userId, {
        gameKey: "limbo",
        amount: betAmount,
        walletType,
      });
      if (debit.error) {
        return { error: debit.error };
      }

      // Generate random number between 1 and 100
      const randomNumber = (Math.random() * 99 + 1).toFixed(2);
      const isWin = parseFloat(randomNumber) > targetMultiplier;

      // Calculate winnings
      const winAmount = isWin ? betAmount * targetMultiplier : 0;
      const profit = winAmount - betAmount;

      // Credit winnings (stake + profit) on a win; a loss credits nothing.
      const credit = await creditGameWin(userId, {
        gameKey: "limbo",
        amount: winAmount,
        walletType,
      });
      const newBalance = credit.balance ?? debit.balance;

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

      // Save game record
      await Game.findOneAndUpdate(
        { name: "limbo" },
        { $push: { history: gameRecord } }
      );

      return {
        success: true,
        result: {
          number: randomNumber,
          isWin,
          profit,
          newBalance,
          walletType,
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
