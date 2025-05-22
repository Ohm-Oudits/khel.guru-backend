import User from "../../../models/user.model.js";
import Game from "../../../models/game.model.js";
import { chances } from "./constants.js";

const generateRandomNumbers = (count, min, max) => {
  const numbers = new Set();
  while (numbers.size < count) {
    const randomNumber = Math.floor(Math.random() * (max - min + 1)) + min;
    numbers.add(randomNumber);
  }
  return Array.from(numbers);
};

const service = {
  async playGame(userId, checkedBoxes, bet, risk) {
    try {
      const game = await Game.findOne({ name: "keno" });
      if (!game) {
        throw new Error("Game not found");
      }

      const user = await User.findById(userId);
      if (!user) {
        throw new Error("User not found");
      }

      // Create grid
      const grid = Array.from({ length: 40 }, () => ({
        type: "diamond",
        revealed: true,
      }));

      const gifts = generateRandomNumbers(10, 0, 39);

      const matches = gifts.filter((num) => checkedBoxes.includes(num)).length;

      const payout =
        chances(risk)[checkedBoxes.length - 1]?.values[0]?.[matches] || 0;

      const gameIndex = user.continuedGames.findIndex(
        (gameId) => gameId.toString() === game._id.toString()
      );
      if (gameIndex !== -1) {
        user.continuedGames.splice(gameIndex, 1);
      }
      user.continuedGames.unshift(game._id);
      game.gamesPlayed += 1;

      await user.save();
      await game.save();

      return { success: true, grid, gifts, matches, payout };
    } catch (error) {
      throw new Error(
        "An error occurred while playing the game: " + error.message
      );
    }
  },

  async join(userId) {
    try {
      const game = await Game.findOne({ name: "keno" });
      if (!game) {
        throw new Error("Game not found");
      }

      const user = await User.findById(userId);
      if (!user) {
        throw new Error("User not found");
      }

      const gameIndex = user.continuedGames.findIndex(
        (gameId) => gameId.toString() === game._id.toString()
      );

      if (gameIndex !== -1) {
        user.continuedGames.splice(gameIndex, 1);
      }
      user.continuedGames.unshift(game._id);
      game.gamesPlayed += 1;

      await user.save();
      await game.save();
      return { success: true };
    } catch (error) {
      throw new Error("An error occurred while joining the game");
    }
  },

  async crash() {
    try {
      console.log("Crash Logic");
    } catch (error) {
      throw new Error("An error occurred while crashing the game");
    }
  },
};

export default service;
