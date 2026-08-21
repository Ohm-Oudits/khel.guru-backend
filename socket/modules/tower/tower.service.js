import User from "../../../models/user.model.js";
import Tower from "../../../models/games/tower.model.js";
import {
  debitGameStake,
  creditGameWin,
  refundGameStake,
  getGameBalance,
  resolveGameWalletType,
} from "../../../services/casinoWallet.service.js";
import { consumeGameFloats } from "../../../services/fairnessConsume.service.js";
import {
  buildTowerGrid,
  buildTowerFairnessPayload,
  floatsNeededForTower,
  getRowColFromIndex,
  getTowerDifficulty,
  normalizeTowerDifficulty,
  revealAllBoxes,
  serializeTowerState,
  TOWER_ROWS,
} from "./tower.game.js";
import {
  computeTowerCheckoutProfit,
  computeTowerWinProfit,
  getTowerProgress,
} from "./tower.payout.js";

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

      const revealAll =
        tower.gameOver || tower.gameWon || tower.checkedOut;
      return {
        ...serializeTowerState(tower, { revealAll }),
        hasActiveGame: !tower.gameOver && !tower.gameWon && !tower.checkedOut,
      };
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
          currentGame: serializeTowerState(existingGame),
        };
      }

      const resolvedWalletType = resolveGameWalletType(walletType);
      const debit = await debitGameStake(userId, {
        gameKey: "tower",
        amount: betAmount,
        walletType: resolvedWalletType,
      });
      if (debit.error) {
        throw new Error(debit.error);
      }

      const fairness = await consumeGameFloats({
        userId,
        gameKey: "tower",
        count: floatsNeededForTower(difficulty),
      });
      const { grid, cols } = buildTowerGrid(fairness.floats, difficulty);
      const normalizedDifficulty = normalizeTowerDifficulty(difficulty);

      let tower;
      try {
        tower = await Tower.findOneAndUpdate(
          { userId },
          {
            userId,
            grid,
            cols,
            betAmount: debit.stake ?? betAmount,
            gameOver: false,
            gameWon: false,
            profit: 0,
            loss: 0,
            checkedOut: false,
            currentRow: TOWER_ROWS - 1,
            difficulty: normalizedDifficulty,
            selectedBoxes: [],
            stepsCompleted: 0,
            walletType: resolvedWalletType,
            settled: false,
            nonce: fairness.nonce,
            clientSeed: fairness.clientSeed,
            serverSeedHash: fairness.serverSeedHash,
          },
          { upsert: true, new: true }
        );
      } catch (createError) {
        await refundGameStake(userId, {
          gameKey: "tower",
          amount: betAmount,
          walletType: resolvedWalletType,
        });
        throw createError;
      }

      return {
        ...serializeTowerState(tower),
        hasActiveGame: true,
        existingGame: false,
        newBalance: debit.balance,
        walletType: resolvedWalletType,
        fairness: buildTowerFairnessPayload(tower),
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

      const cols = tower.cols || getTowerDifficulty(tower.difficulty).cols;
      const { row, col } = getRowColFromIndex(index, cols);
      if (row !== tower.currentRow) {
        throw new Error("Invalid row selection");
      }

      if (!tower.selectedBoxes) {
        tower.selectedBoxes = [];
      }

      const isAlreadyRevealed = tower.selectedBoxes.some(
        (box) => box.row === row && box.col === col
      );
      if (isAlreadyRevealed) {
        throw new Error("Box already revealed");
      }

      const grid = tower.grid.map((gridRow) =>
        gridRow.map((cell) => ({ ...cell }))
      );
      grid[row][col].revealed = true;
      const isCorrect = tower.grid[row][col].isCorrect;

      tower.selectedBoxes.push({ row, col, isCorrect });
      tower.stepsCompleted = (tower.stepsCompleted || 0) + 1;

      if (!isCorrect) {
        tower.gameOver = true;
        tower.loss = tower.betAmount;
        revealAllBoxes(grid);
      } else if (row === 0) {
        tower.gameWon = true;
        tower.profit = computeTowerWinProfit({
          difficulty: tower.difficulty,
          betAmount: tower.betAmount,
        });
        revealAllBoxes(grid);
      } else {
        tower.currentRow -= 1;
      }

      tower.grid = grid;
      await tower.save();

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

      const revealAll = tower.gameOver || tower.gameWon;
      return {
        isCorrect,
        gameOver: tower.gameOver,
        gameWon: tower.gameWon,
        currentRow: tower.currentRow,
        profit: tower.profit,
        loss: tower.loss,
        grid: serializeTowerState(tower, { revealAll }).grid,
        row,
        col,
        selectedBoxes: tower.selectedBoxes.map(({ row: r, col: c, isCorrect: ok }) => ({
          row: r,
          col: c,
          correct: ok,
          isCorrect: ok,
        })),
        step: tower.stepsCompleted,
        newBalance,
        walletType: tower.walletType || "demo",
        fairness: buildTowerFairnessPayload(tower),
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
        const progress = getTowerProgress({
          currentRow: tower.currentRow,
          rows: tower.grid.length,
        });

        if (progress <= 0) {
          throw new Error("Checkout requires at least one cleared row");
        }

        tower.profit = computeTowerCheckoutProfit({
          difficulty: tower.difficulty,
          betAmount: tower.betAmount,
          currentRow: tower.currentRow,
          rows: tower.grid.length,
        });
        tower.checkedOut = true;
        revealAllBoxes(tower.grid);

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
        newBalance = await getGameBalance(userId, walletType);
      }

      const checkoutData = serializeTowerState(tower, { revealAll: true });
      checkoutData.checkedOut = true;
      checkoutData.fairnessSnapshot = buildTowerFairnessPayload(tower, {
        betAmount: tower.betAmount,
      });

      await Tower.findOneAndUpdate({ userId }, checkoutData, { new: true });
      await Tower.deleteOne({ userId });

      return {
        ...checkoutData,
        profit: tower.profit,
        loss: tower.loss,
        newBalance,
        walletType,
        fairness: buildTowerFairnessPayload(tower, { betAmount: tower.betAmount }),
      };
    } catch (error) {
      throw new Error(error.message || "Failed to checkout");
    }
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
        ...serializeTowerState(tower),
        hasActiveGame: true,
        existingGame: false,
        fairness: buildTowerFairnessPayload(tower),
      };
    } catch (error) {
      throw new Error(error.message || "Failed to continue game");
    }
  },
};

export default service;
