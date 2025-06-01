import User from "../../../models/user.model.js";
import Game from "../../../models/game.model.js";

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
      const { bin, payout, betAmount } = data;

      const user = await User.findById(userId);
      if (!user) {
        return { error: "User not found" };
      }

      // Check if user has enough balance
      if (user.balance < betAmount) {
        return { error: "Insufficient balance" };
      }

      // Deduct bet amount
      user.balance -= betAmount;

      // Add payout if won
      if (payout > 0) {
        user.balance += payout;
      }

      await user.save();

      return {
        success: true,
        data: {
          balance: user.balance,
          payout,
          bin,
          multiplier: payout / betAmount,
        },
      };
    } catch (error) {
      console.error("Result processing error:", error);
      return { error: "An error occurred while processing the result" };
    }
  },
};

export default service;
