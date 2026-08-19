import User from "../../../models/user.model.js";
import Game from "../../../models/game.model.js";
import { debitGameStake } from "../../../services/casinoWallet.service.js";

const service = {
  async join(userId) {
    try {
      const game = await Game.findOne({ name: "twist" });
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

  async placeBet(userId, betAmount, walletType = "demo") {
    try {
      // Debit the stake from the wallet. Twist's spin outcome (which diamond
      // is collected) is resolved client-side and defines no payout, so the
      // stake debit is the only money movement for a spin.
      const debit = await debitGameStake(userId, {
        gameKey: "twist",
        amount: betAmount,
        walletType,
      });
      if (debit.error) {
        return { error: debit.error };
      }

      return {
        result: {
          betAmount: debit.stake,
          newBalance: debit.balance,
          walletType,
        },
      };
    } catch (error) {
      console.error("Error in twist placeBet:", error);
      return { error: "An error occurred while placing bet" };
    }
  },
};

export default service;
