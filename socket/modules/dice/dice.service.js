import User from "../../../models/user.model.js";
import Game from "../../../models/game.model.js";

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

  async rollDice(userId, betAmount, prediction, rollUnder) {
    try {
      if (
        !userId ||
        !betAmount ||
        !prediction ||
        typeof rollUnder === "undefined"
      ) {
        throw new Error("Missing required parameters");
      }

      // Generate random roll between 0-100
      const rawRoll = Math.floor(Math.random() * 101);

      // Calculate win based on rollUnder parameter
      const isWin = rollUnder ? rawRoll < prediction : rawRoll > prediction;

      // Calculate multiplier using the same formula as frontend
      const houseEdge = 1;
      const winChance = rollUnder ? prediction : 100 - prediction;
      const multiplier = (100 - houseEdge) / winChance;

      // Calculate profit
      const winnings = isWin ? betAmount * multiplier : 0;
      const profit = winnings - betAmount;

      return {
        result: {
          diceRoll: rawRoll, // Send raw roll (0-100) to match frontend display
          prediction,
          isWin,
          multiplier: parseFloat(multiplier.toFixed(2)),
          profit: parseFloat(profit.toFixed(6)),
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
