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
import { shuffleMinesFromFloats } from "../../../services/provablyFair.service.js";

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

      const resolvedWalletType = resolveGameWalletType(walletType);

      // Debit the stake exactly once, when the round starts. A losing round
      // (bomb) keeps this debit; a cashout credits stake + profit back.
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
          count: 24,
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
        });
      } catch (createError) {
        // The round never started (e.g. duplicate-game race): hand the
        // stake back so the debit does not leak.
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
        game: minesGame,
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

      let newBalance;
      if (unrevealedDiamonds === 0) {
        minesGame.gameWon = true;
        const multiplier = (25 - minesGame.mines) / minesGame.mines;
        minesGame.profit = (
          parseFloat(minesGame.betAmount) * multiplier
        ).toFixed(6);
        // Deleting the round doc is the settlement guard: only the caller
        // that actually removed it credits the payout, so a full-board win
        // can never be paid twice (nor again via a later "checkout" emit).
        const deletion = await minesGame.deleteOne();
        if (deletion?.deletedCount === 1) {
          const payout =
            parseFloat(minesGame.betAmount) + parseFloat(minesGame.profit);
          const credit = await creditGameWin(userId, {
            gameKey: "mines",
            amount: payout,
            walletType: minesGame.walletType || "demo",
          });
          newBalance = credit.balance;
        }
      } else {
        await minesGame.save();
      }

      return {
        success: true,
        game: minesGame,
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
              ...minesGame.toObject(),
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
      // Atomically pop the round: findOneAndDelete makes sure exactly one
      // concurrent checkout wins the doc, so the payout is credited once.
      // (A busted round was already deleted in reveal(), so a stray
      // checkout after a bomb finds nothing and credits nothing.)
      const minesGame = await Mines.findOneAndDelete({ userId });
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

      // Credit the total payout (stake + profit) exactly once.
      const payout = parseFloat(minesGame.betAmount) + parseFloat(profit);
      const credit = await creditGameWin(userId, {
        gameKey: "mines",
        amount: payout,
        walletType: minesGame.walletType || "demo",
      });

      return {
        success: true,
        profit,
        revealedDiamonds,
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
