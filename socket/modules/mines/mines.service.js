import User from "../../../models/user.model.js";
import Game from "../../../models/game.model.js";
import Mines from "../../../models/games/mines.model.js";

const createGrid = (mines) => {
  const grid = Array(25)
    .fill()
    .map(() => ({
      type: "diamond",
      revealed: false,
    }));

  let bombCount = 0;
  while (bombCount < mines) {
    const bombIndex = Math.floor(Math.random() * 25);
    if (grid[bombIndex].type !== "bomb") {
      grid[bombIndex] = {
        type: "bomb",
        revealed: false,
      };
      bombCount++;
    }
  }

  return grid;
};

const service = {
  async join(userId, betAmount, mines) {
    try {
      const game = await Game.findOne({ name: "mines" });
      if (!game) {
        return { error: "Game not found" };
      }

      const user = await User.findById(userId);
      if (!user) {
        return { error: "User not found" };
      }

      // Check if user has an existing game
      const existingGame = await Mines.findOne({ userId });
      if (existingGame) {
        return {
          success: true,
          hasActiveGame: true,
          game: existingGame,
          message: "Existing game found",
        };
      }

      const grid = createGrid(mines);
      const minesGame = await Mines.create({
        userId,
        grid,
        mines,
        gems: 25 - mines,
        gameOver: false,
        gameWon: false,
        betAmount,
        profit: "0.000000",
        loss: "0.000000",
      });

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

      return {
        success: true,
        hasActiveGame: false,
        game: minesGame,
        message: "New game created",
      };
    } catch (error) {
      console.error("Join game error:", error);
      return { error: "An error occurred while joining the game" };
    }
  },

  async continueGame(userId) {
    try {
      const existingGame = await Mines.findOne({ userId });
      if (!existingGame) {
        return { error: "No game found" };
      }

      // Return the complete game state
      return {
        success: true,
        game: {
          ...existingGame.toObject(),
          hasActiveGame: true,
          message: "Continuing existing game",
        },
      };
    } catch (error) {
      console.error("Continue game error:", error);
      return { error: "An error occurred while continuing the game" };
    }
  },

  async reveal(userId, index) {
    try {
      const minesGame = await Mines.findOne({ userId });
      if (!minesGame) {
        return { error: "No game found" };
      }

      if (minesGame.grid[index].revealed) {
        return { error: "Tile already revealed" };
      }

      minesGame.grid[index].revealed = true;

      if (minesGame.grid[index].type === "bomb") {
        minesGame.gameOver = true;
        minesGame.loss = minesGame.betAmount;
        await minesGame.deleteOne();
        return {
          success: true,
          game: minesGame,
          result: "bomb",
        };
      }

      minesGame.gems -= 1;

      const unrevealedDiamonds = minesGame.grid.filter(
        (tile) => tile.type === "diamond" && !tile.revealed
      ).length;

      if (unrevealedDiamonds === 0) {
        minesGame.gameWon = true;
        const multiplier = (25 - minesGame.mines) / minesGame.mines;
        minesGame.profit = (
          parseFloat(minesGame.betAmount) * multiplier
        ).toFixed(6);
        await minesGame.deleteOne();
      } else {
        await minesGame.save();
      }

      return {
        success: true,
        game: minesGame,
        result: "diamond",
      };
    } catch (error) {
      console.error("Reveal error:", error);
      return { error: "An error occurred while revealing tile" };
    }
  },

  async getActiveGame(userId) {
    try {
      const minesGame = await Mines.findOne({ userId });
      return minesGame
        ? { success: true, game: minesGame }
        : { success: false };
    } catch (error) {
      console.error("Get active game error:", error);
      return { error: "An error occurred while fetching game" };
    }
  },

  async checkout(userId) {
    try {
      const minesGame = await Mines.findOne({ userId });
      if (!minesGame) {
        return { error: "No game found" };
      }

      // Calculate profit based on revealed diamonds
      const revealedDiamonds = minesGame.grid.filter(
        (tile) => tile.type === "diamond" && tile.revealed
      ).length;

      const multiplier = (25 - minesGame.mines) / minesGame.mines;
      const profit = (
        parseFloat(minesGame.betAmount) *
        multiplier *
        (revealedDiamonds / (25 - minesGame.mines))
      ).toFixed(6);

      // Delete the game
      await minesGame.deleteOne();

      return {
        success: true,
        profit,
        revealedDiamonds,
      };
    } catch (error) {
      console.error("Checkout error:", error);
      return { error: "An error occurred while checking out" };
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
