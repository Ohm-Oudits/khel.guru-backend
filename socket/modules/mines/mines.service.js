import User from "../../../models/user.model.js";
import Game from "../../../models/game.model.js";
import Mines from "../../../models/games/mines.model.js";
import Transaction from "../../../models/transaction.model.js";
import {
  debitGameStake,
  creditGameWin,
  refundGameStake,
  resolveGameWalletType,
} from "../../../services/casinoWallet.service.js";
import { consumeGameFloats } from "../../../services/fairnessConsume.service.js";
import {
  MINES_EVENT_COUNT,
  revealedGemsFromRound,
  serializeMinesState,
  settleMinesCashout,
  shuffleMinesFromFloats,
} from "./mines.fairness.js";

const createGrid = (mineIndexes) => {
  const grid = Array(25)
    .fill()
    .map(() => ({
      type: "diamond",
      revealed: false,
    }));

  for (const bombIndex of mineIndexes) {
    if (bombIndex >= 0 && bombIndex < 25) {
      grid[bombIndex] = {
        type: "bomb",
        revealed: false,
      };
    }
  }

  return grid;
};

const settleFromGrid = (minesGame) =>
  settleMinesCashout({
    betAmount: minesGame.betAmount,
    mineCount: minesGame.mines,
    gemsRevealed: revealedGemsFromRound(minesGame),
  });

const service = {
  async join(userId, betAmount, mines, walletType = "demo") {
    try {
      const game = await Game.findOne({ name: "mines" });
      if (!game) {
        return { error: "Game not found" };
      }

      const user = await User.findById(userId);
      if (!user) {
        return { error: "User not found" };
      }

      const existingGame = await Mines.findOne({ userId });
      if (existingGame) {
        return {
          success: true,
          hasActiveGame: true,
          game: serializeMinesState(existingGame),
          message: "Existing game found",
        };
      }

      const resolvedWalletType = resolveGameWalletType(walletType);

      const debit = await debitGameStake(userId, {
        gameKey: "mines",
        amount: betAmount,
        walletType: resolvedWalletType,
      });
      if (debit.error) {
        return { error: debit.error };
      }

      let minesGame;
      try {
        const fairness = await consumeGameFloats({
          userId,
          gameKey: "mines",
          count: MINES_EVENT_COUNT,
        });
        const mineIndexes = shuffleMinesFromFloats(fairness.floats, mines);
        const grid = createGrid(mineIndexes);
        minesGame = await Mines.create({
          userId,
          grid,
          mines,
          gems: 25 - mines,
          gameOver: false,
          gameWon: false,
          betAmount,
          walletType: resolvedWalletType,
          profit: "0.000000",
          loss: "0.000000",
          nonce: fairness.nonce,
          clientSeed: fairness.clientSeed,
          serverSeedHash: fairness.serverSeedHash,
        });
      } catch (createError) {
        await refundGameStake(userId, {
          gameKey: "mines",
          amount: debit.stake,
          walletType: resolvedWalletType,
        });
        throw createError;
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

      return {
        success: true,
        hasActiveGame: false,
        game: serializeMinesState(minesGame),
        message: "New game created",
        newBalance: debit.balance,
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

      return {
        success: true,
        game: {
          ...serializeMinesState(existingGame),
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
      minesGame.markModified("grid");

      if (minesGame.grid[index].type === "bomb" || minesGame.grid[index].get?.("type") === "bomb") {
        minesGame.gameOver = true;
        minesGame.loss = minesGame.betAmount;
        await minesGame.deleteOne();
        return {
          success: true,
          game: serializeMinesState(minesGame),
          result: "bomb",
        };
      }

      minesGame.gems -= 1;

      const unrevealedDiamonds = minesGame.grid.filter(
        (tile) => tile.type === "diamond" && !tile.revealed
      ).length;

      let newBalance;
      if (unrevealedDiamonds === 0) {
        minesGame.gameWon = true;
        const settlement = settleFromGrid(minesGame);
        minesGame.profit = settlement.profit.toFixed(6);
        const deletion = await minesGame.deleteOne();
        if (deletion?.deletedCount === 1) {
          const credit = await creditGameWin(userId, {
            gameKey: "mines",
            amount: settlement.payout,
            walletType: minesGame.walletType || "demo",
          });
          newBalance = credit.balance;
        }
        return {
          success: true,
          game: {
            ...serializeMinesState(minesGame),
            multiplier: settlement.multiplier,
            profit: settlement.profit.toFixed(6),
          },
          result: "diamond",
          newBalance,
        };
      }

      await minesGame.save();
      const live = settleFromGrid(minesGame);

      return {
        success: true,
        game: {
          ...serializeMinesState(minesGame),
          multiplier: live.multiplier,
          profit: live.profit.toFixed(6),
        },
        result: "diamond",
        newBalance,
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
        ? {
            success: true,
            game: {
              ...serializeMinesState(minesGame),
              hasActiveGame: true,
            },
          }
        : { success: false };
    } catch (error) {
      console.error("Get active game error:", error);
      return { error: "An error occurred while fetching game" };
    }
  },

  async checkout(userId) {
    try {
      const minesGame = await Mines.findOneAndDelete({ userId });
      if (!minesGame) {
        return { error: "No game found" };
      }

      const settlement = settleFromGrid(minesGame);
      const credit = await creditGameWin(userId, {
        gameKey: "mines",
        amount: settlement.payout,
        walletType: minesGame.walletType || "demo",
      });

      return {
        success: true,
        profit: settlement.profit.toFixed(6),
        multiplier: settlement.multiplier,
        payout: settlement.payout,
        revealedDiamonds: settlement.gemsRevealed,
        betAmount: minesGame.betAmount,
        fairness: serializeMinesState(minesGame).fairness,
        newBalance: credit.balance,
      };
    } catch (error) {
      console.error("Checkout error:", error);
      return { error: "An error occurred during checkout" };
    }
  },

  async getHistory() {
    try {
      const history = await Transaction.find({ game: "mines" })
        .sort({ createdAt: -1 })
        .limit(10)
        .populate("userId", "username");
      return history;
    } catch (error) {
      console.error("Get history error:", error);
      return { error: "An error occurred while fetching history" };
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
