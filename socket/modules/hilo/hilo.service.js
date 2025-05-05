import User from "../../../models/user.model.js";
import Game from "../../../models/game.model.js";

const service = {
  async join(userId) {
    try {
      const game = await Game.findOne({ name: "hilo" });
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

  async checkout() {
    try {
      console.log("Checkout");
    } catch (error) {
      return { error: "An error occurred while checkout the game" };
    }
  },

  async crash() {
    try {
      console.log("Crash Logic");
    } catch (error) {
      return { error: "An error occurred while crashing the game" };
    }
  },
};

export default service;
