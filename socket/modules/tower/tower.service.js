import User from "../../../models/user.model.js";
import Game from "../../../models/game.model.js";
import Tower from "../../../models/games/tower.model.js";

const service = {
  async getGameState(userId) {
    try {
      const tower = await Tower.findOne({ userId });
      if (!tower) {
        return {
          hasActiveGame: false,
          grid: null,
          betAmount: 0,
          gameOver: false,
          gameWon: false,
          profit: 0,
          loss: 0,
          checkedOut: false,
        };
      }
      return tower;
    } catch (error) {
      throw new Error("Failed to get game state");
    }
  },

  async startGame(userId, betAmount, difficulty) {
    try {
      const user = await User.findById(userId);
      if (!user) {
        throw new Error("User not found");
      }

      // Generate grid based on difficulty
      const grid = this.generateGrid(difficulty);

      // Create or update tower game
      const tower = await Tower.findOneAndUpdate(
        { userId },
        {
          userId,
          grid,
          betAmount,
          gameOver: false,
          gameWon: false,
          profit: 0,
          loss: 0,
          checkedOut: false,
          currentRow: grid.length - 1, // Start from bottom row
          difficulty,
        },
        { upsert: true, new: true }
      );

      return {
        ...tower.toObject(),
        hasActiveGame: true,
        currentRow: tower.currentRow,
        grid: tower.grid,
      };
    } catch (error) {
      throw new Error(error.message || "Failed to start game");
    }
  },

  async revealBox(userId, index) {
    try {
      const tower = await Tower.findOne({ userId });
      if (!tower) {
        throw new Error("No active game found");
      }

      if (tower.gameOver || tower.gameWon || tower.checkedOut) {
        throw new Error("Game is already over");
      }

      const { row, col } = this.getRowColFromIndex(index);
      if (row !== tower.currentRow) {
        throw new Error("Invalid row selection");
      }

      // Update grid
      const grid = [...tower.grid];
      grid[row][col].revealed = true;
      const isCorrect = tower.grid[row][col].isCorrect;

      // Check if game is over
      if (!isCorrect) {
        tower.gameOver = true;
        tower.loss = tower.betAmount;
        // Reveal all boxes when game is over
        this.revealAllBoxes(grid);
      } else if (row === 0) {
        // Calculate profit based on difficulty and rows completed
        const multiplier = this.getMultiplier(tower.difficulty);
        tower.gameWon = true;
        tower.profit = tower.betAmount * multiplier;
        // Reveal all boxes when game is won
        this.revealAllBoxes(grid);
      } else {
        tower.currentRow--;
      }

      tower.grid = grid;
      await tower.save();

      return {
        isCorrect,
        gameOver: tower.gameOver,
        gameWon: tower.gameWon,
        currentRow: tower.currentRow,
        profit: tower.profit,
        loss: tower.loss,
        grid: tower.grid,
      };
    } catch (error) {
      throw new Error(error.message || "Failed to reveal box");
    }
  },

  async checkout(userId) {
    try {
      const tower = await Tower.findOne({ userId });
      if (!tower) {
        throw new Error("No active game found");
      }

      if (!tower.gameOver && !tower.gameWon) {
        // Calculate profit based on current progress
        const multiplier = this.getMultiplier(tower.difficulty);
        const progress = tower.grid.length - tower.currentRow - 1;
        const profit =
          tower.betAmount * (multiplier * (progress / tower.grid.length));

        tower.profit = profit;
        tower.checkedOut = true;

        // Reveal all boxes when checking out
        this.revealAllBoxes(tower.grid);
      }

      // Save the final state before deleting
      await tower.save();

      // Delete the tower entry
      await Tower.deleteOne({ userId });

      return {
        ...tower.toObject(),
        checkedOut: true,
        grid: tower.grid,
        profit: tower.profit,
        loss: tower.loss,
      };
    } catch (error) {
      throw new Error(error.message || "Failed to checkout");
    }
  },

  // Helper function to reveal all boxes
  revealAllBoxes(grid) {
    for (let row = 0; row < grid.length; row++) {
      for (let col = 0; col < grid[row].length; col++) {
        grid[row][col].revealed = true;
      }
    }
  },

  // Helper functions
  generateGrid(difficulty) {
    const rows = 9;
    const cols = this.getColsForDifficulty(difficulty);
    const correctBoxes = this.getCorrectBoxesForDifficulty(difficulty);

    const grid = Array(rows)
      .fill()
      .map(() =>
        Array(cols)
          .fill()
          .map(() => ({
            revealed: false,
            isCorrect: false,
          }))
      );

    // Place correct boxes
    for (let row = 0; row < rows; row++) {
      const correctIndices = new Set();
      while (correctIndices.size < correctBoxes) {
        correctIndices.add(Math.floor(Math.random() * cols));
      }
      correctIndices.forEach((col) => {
        grid[row][col].isCorrect = true;
      });
    }

    return grid;
  },

  getColsForDifficulty(difficulty) {
    switch (difficulty) {
      case "Easy":
        return 4;
      case "Medium":
        return 4;
      case "Hard":
        return 2;
      case "Extreme":
        return 3;
      case "Nightmare":
        return 4;
      default:
        return 4;
    }
  },

  getCorrectBoxesForDifficulty(difficulty) {
    switch (difficulty) {
      case "Easy":
        return 3;
      case "Medium":
        return 2;
      case "Hard":
        return 1;
      case "Extreme":
        return 1;
      case "Nightmare":
        return 1;
      default:
        return 3;
    }
  },

  getMultiplier(difficulty) {
    switch (difficulty) {
      case "Easy":
        return 1.5;
      case "Medium":
        return 2;
      case "Hard":
        return 3;
      case "Extreme":
        return 4;
      case "Nightmare":
        return 5;
      default:
        return 1.5;
    }
  },

  getRowColFromIndex(index) {
    const row = Math.floor(index / 4); // Assuming 4 columns
    const col = index % 4;
    return { row, col };
  },
};

export default service;
