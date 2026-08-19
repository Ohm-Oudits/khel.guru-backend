import User from "../../../models/user.model.js";
import Game from "../../../models/game.model.js";
import { chances } from "./constants.js";
import {
  debitGameStake,
  creditGameWin,
} from "../../../services/casinoWallet.service.js";

const generateRandomNumbers = (count, min, max) => {
  const numbers = new Set();
  while (numbers.size < count) {
    const randomNumber = Math.floor(Math.random() * (max - min + 1)) + min;
    numbers.add(randomNumber);
  }
  return Array.from(numbers);
};

const service = {
  async playGame(userId, checkedBoxes, bet, risk, walletType = "demo") {
    // Debit the stake from the wallet first; a losing bet keeps this debit.
    const betAmount = parseFloat(bet);
    const debit = await debitGameStake(userId, {
      gameKey: "keno",
      amount: betAmount,
      walletType,
    });
    if (debit.error) {
      return { error: debit.error };
    }

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

      // payout is a multiplier; credit the total return (stake * multiplier).
      const winAmount = betAmount * payout;
      const credit = await creditGameWin(userId, {
        gameKey: "keno",
        amount: winAmount,
        walletType,
      });
      const newBalance = credit.balance ?? debit.balance;

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

      return {
        success: true,
        grid,
        gifts,
        matches,
        payout,
        winAmount,
        newBalance,
        walletType,
      };
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
