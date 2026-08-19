import User from "../../../models/user.model.js";
import Game from "../../../models/game.model.js";
import Tower from "../../../models/games/tower.model.js";
import {
  debitGameStake,
  creditGameWin,
  refundGameStake,
  getGameBalance,
  resolveGameWalletType,
} from "../../../services/casinoWallet.service.js";

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

  async startGame(userId, betAmount, difficulty, walletType = "demo") {
    try {
      const user = await User.findById(userId);
      if (!user) {
        throw new Error("User not found");
      }

      // Check for existing game — resuming an in-flight round must NOT
      // debit again (its stake was taken when it was created).
      const existingGame = await Tower.findOne({ userId });
      if (
        existingGame &&
        !existingGame.gameOver &&
        !existingGame.gameWon &&
        !existingGame.checkedOut
      ) {
        return {
          hasActiveGame: true,
          existingGame: true,
          message: "You have an active game. Please continue or checkout.",
          currentGame: existingGame,
        };
      }

      const resolvedWalletType = resolveGameWalletType(walletType);

      // Debit the stake exactly once, when the new round is created.
      const debit = await debitGameStake(userId, {
        gameKey: "tower",
        amount: betAmount,
        walletType: resolvedWalletType,
      });
      if (debit.error) {
        throw new Error(debit.error);
      }

      // Generate grid based on difficulty
      const grid = this.generateGrid(difficulty);

      // Create or update tower game
      let tower;
      try {
        tower = await Tower.findOneAndUpdate(
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
            selectedBoxes: [], // Add selectedBoxes array to track revealed boxes
            walletType: resolvedWalletType,
            settled: false,
          },
          { upsert: true, new: true }
        );
      } catch (createError) {
        // The round never came into existence: give the stake back.
        await refundGameStake(userId, {
          gameKey: "tower",
          amount: betAmount,
          walletType: resolvedWalletType,
        });
        throw createError;
      }

      return {
        ...tower.toObject(),
        hasActiveGame: true,
        existingGame: false,
        currentRow: tower.currentRow,
        grid: tower.grid,
        newBalance: debit.balance,
        walletType: resolvedWalletType,
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

      // Initialize selectedBoxes if it doesn't exist
      if (!tower.selectedBoxes) {
        tower.selectedBoxes = [];
      }

      // Check if box is already revealed
      const isAlreadyRevealed = tower.selectedBoxes.some(
        (box) => box.row === row && box.col === col
      );
      if (isAlreadyRevealed) {
        throw new Error("Box already revealed");
      }

      // Update grid and track revealed box
      const grid = [...tower.grid];
      grid[row][col].revealed = true;
      const isCorrect = tower.grid[row][col].isCorrect;

      // Add to selected boxes
      tower.selectedBoxes.push({ row, col, isCorrect });

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

      // Reaching the top settles the round: credit the total payout exactly
      // once by claiming the round's `settled` flag atomically. Checkout on
      // an already-won game skips crediting (see checkout below), so a win
      // can never pay twice.
      let newBalance = null;
      if (tower.gameWon) {
        const claim = await Tower.findOneAndUpdate(
          { _id: tower._id, settled: { $ne: true } },
          { $set: { settled: true } }
        );
        if (claim) {
          const credit = await creditGameWin(userId, {
            gameKey: "tower",
            amount: tower.profit,
            walletType: tower.walletType || "demo",
          });
          newBalance = credit.balance;
        }
      }

      return {
        isCorrect,
        gameOver: tower.gameOver,
        gameWon: tower.gameWon,
        currentRow: tower.currentRow,
        profit: tower.profit,
        loss: tower.loss,
        grid: tower.grid,
        row,
        col,
        selectedBoxes: tower.selectedBoxes,
        newBalance,
        walletType: tower.walletType || "demo",
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

      const walletType = tower.walletType || "demo";
      let newBalance = null;

      if (!tower.gameOver && !tower.gameWon) {
        // Calculate profit based on current progress
        const multiplier = this.getMultiplier(tower.difficulty);
        const progress = tower.grid.length - tower.currentRow - 1;
        const calculatedProfit =
          tower.betAmount * (multiplier * (progress / tower.grid.length));

        // Ensure profit is a valid number
        tower.profit = isNaN(calculatedProfit) ? 0 : calculatedProfit;
        tower.checkedOut = true;

        // Reveal all boxes when checking out
        this.revealAllBoxes(tower.grid);

        // Settle the cashout exactly once: claim the round's `settled` flag
        // atomically before crediting, so racing checkouts can't pay twice.
        const claim = await Tower.findOneAndUpdate(
          { _id: tower._id, settled: { $ne: true } },
          { $set: { settled: true } }
        );
        if (claim && tower.profit > 0) {
          const credit = await creditGameWin(userId, {
            gameKey: "tower",
            amount: tower.profit,
            walletType,
          });
          newBalance = credit.balance;
        }
      } else {
        // A won round was already credited at the winning reveal; a lost
        // round keeps its debit. Nothing to move — just report the balance.
        newBalance = await getGameBalance(userId, walletType);
      }

      // Ensure all required fields are present
      const checkoutData = {
        userId: tower.userId,
        grid: tower.grid,
        betAmount: tower.betAmount,
        gameOver: tower.gameOver,
        gameWon: tower.gameWon,
        profit: tower.profit,
        loss: tower.loss,
        checkedOut: true,
        currentRow: tower.currentRow,
        difficulty: tower.difficulty,
        selectedBoxes: tower.selectedBoxes || [],
      };

      // Save the final state before deleting
      await Tower.findOneAndUpdate({ userId }, checkoutData, { new: true });

      // Delete the tower entry
      await Tower.deleteOne({ userId });

      return {
        ...checkoutData,
        checkedOut: true,
        grid: tower.grid,
        profit: tower.profit,
        loss: tower.loss,
        newBalance,
        walletType,
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

  async continueGame(userId) {
    try {
      const tower = await Tower.findOne({ userId });
      if (!tower) {
        throw new Error("No active game found");
      }

      if (tower.gameOver || tower.gameWon || tower.checkedOut) {
        throw new Error("Game is already over");
      }

      return {
        ...tower.toObject(),
        hasActiveGame: true,
        existingGame: false,
        currentRow: tower.currentRow,
        grid: tower.grid,
        selectedBoxes: tower.selectedBoxes || [],
      };
    } catch (error) {
      throw new Error(error.message || "Failed to continue game");
    }
  },
};

export default service;
