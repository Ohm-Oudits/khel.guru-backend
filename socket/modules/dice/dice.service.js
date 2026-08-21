import User from "../../../models/user.model.js";
import Game from "../../../models/game.model.js";
import {
  debitGameStake,
  creditGameWin,
} from "../../../services/casinoWallet.service.js";
import { consumeGameFloats } from "../../../services/fairnessConsume.service.js";
import { deriveDiceRoll } from "../../../services/provablyFair.service.js";

const service = {
  async join(userId) {
    try {
      const game = await Game.findOne({ name: "dice" });
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

  async rollDice(userId, betAmount, prediction, rollUnder, walletType = "demo") {
    try {
      if (
        !userId ||
        betAmount == null ||
        Number.isNaN(Number(betAmount)) ||
        !prediction ||
        typeof rollUnder === "undefined"
      ) {
        throw new Error("Missing required parameters");
      }

      // Debit the stake from the wallet first; a losing bet keeps this debit.
      const debit = await debitGameStake(userId, {
        gameKey: "dice",
        amount: betAmount,
        walletType,
      });
      if (debit.error) {
        return { error: debit.error };
      }

      const fairness = await consumeGameFloats({
        userId,
        gameKey: "dice",
      });
      const rawRoll = deriveDiceRoll(fairness.floats[0]);

      // Calculate win based on rollUnder parameter
      const isWin = rollUnder ? rawRoll < prediction : rawRoll > prediction;

      // Calculate multiplier using the same formula as frontend
      const houseEdge = 1;
      const winChance = rollUnder ? prediction : 100 - prediction;
      const multiplier = (100 - houseEdge) / winChance;

      // Calculate profit
      const winnings = isWin ? betAmount * multiplier : 0;
      const profit = winnings - betAmount;

      // Credit winnings (stake + profit) on a win; a loss credits nothing.
      const credit = await creditGameWin(userId, {
        gameKey: "dice",
        amount: winnings,
        walletType,
      });
      const newBalance = credit.balance ?? debit.balance;

      return {
        result: {
          diceRoll: rawRoll, // Send raw roll (0-100) to match frontend display
          prediction,
          isWin,
          multiplier: parseFloat(multiplier.toFixed(2)),
          profit: parseFloat(profit.toFixed(6)),
          newBalance,
          walletType,
          nonce: fairness.nonce,
          clientSeed: fairness.clientSeed,
          serverSeedHash: fairness.serverSeedHash,
        },
      };
    } catch (error) {
      console.error("Error in rollDice:", error);
      throw error;
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
