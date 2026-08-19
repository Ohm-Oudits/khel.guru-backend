import User from "../../../models/user.model.js";
import Game from "../../../models/game.model.js";
import {
  debitGameStake,
  creditGameWin,
} from "../../../services/casinoWallet.service.js";

const service = {
  async join(userId) {
    try {
      const game = await Game.findOne({ name: "plinko" });
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

  async result(data, userId) {
    try {
      const { bin, payout, betAmount, walletType = "demo" } = data;

      // Debit the stake from the wallet first; a losing drop keeps this debit.
      const debit = await debitGameStake(userId, {
        gameKey: "plinko",
        amount: betAmount,
        walletType,
      });
      if (debit.error) {
        return { error: debit.error };
      }

      // payout is the total return (stake * bin multiplier); zero is a no-op.
      const credit = await creditGameWin(userId, {
        gameKey: "plinko",
        amount: payout,
        walletType,
      });
      const newBalance = credit.balance ?? debit.balance;

      return {
        success: true,
        data: {
          balance: newBalance,
          newBalance,
          payout,
          bin,
          multiplier: payout / betAmount,
          walletType,
        },
      };
    } catch (error) {
      console.error("Result processing error:", error);
      return { error: "An error occurred while processing the result" };
    }
  },
};

export default service;
