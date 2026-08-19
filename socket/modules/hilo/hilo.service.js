import User from "../../../models/user.model.js";
import Game from "../../../models/game.model.js";
import Hilo from "../../../models/games/hilo.model.js";
import {
  debitGameStake,
  creditGameWin,
  refundGameStake,
  resolveGameWalletType,
} from "../../../services/casinoWallet.service.js";

const CARD_VALUES = [
  "A",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "J",
  "Q",
  "K",
];
const CARD_SUITS = ["♦", "♥", "♠", "♣"];

const getValueIndex = (value) => CARD_VALUES.indexOf(value);

const getRandomCard = () => {
  const randomValue =
    CARD_VALUES[Math.floor(Math.random() * CARD_VALUES.length)];
  const randomSuit = CARD_SUITS[Math.floor(Math.random() * CARD_SUITS.length)];
  const color = Math.random() < 0.5;

  return { value: randomValue, suit: randomSuit, color };
};

const service = {
  async join(userId, betAmount, walletType = "demo") {
    try {
      const game = await Game.findOne({ name: "hilo" });
      if (!game) {
        return { error: "Game not found" };
      }

      const user = await User.findById(userId);
      if (!user) {
        return { error: "User not found" };
      }

      // Check if user has an existing game — resuming an in-flight round
      // must NOT debit again (its stake was taken when it was created).
      const existingGame = await Hilo.findOne({ userId });
      if (existingGame && !existingGame.gameOver && !existingGame.checkedOut) {
        return {
          success: true,
          hasActiveGame: true,
          game: existingGame,
          message: "Existing game found",
        };
      }

      const resolvedWalletType = resolveGameWalletType(walletType);

      // Debit the stake exactly once, when the new round is created.
      const debit = await debitGameStake(userId, {
        gameKey: "hilo",
        amount: betAmount,
        walletType: resolvedWalletType,
      });
      if (debit.error) {
        return { error: debit.error };
      }

      // Create new game
      const initialCard = getRandomCard();
      let hiloGame;
      try {
        hiloGame = await Hilo.create({
          userId,
          currentCard: initialCard,
          historyCards: [{ ...initialCard, result: null }],
          betAmount,
          multiplier: 1.0,
          walletType: resolvedWalletType,
        });
      } catch (createError) {
        // The unique userId index rejects a racing duplicate round; the
        // round never existed, so give the stake back.
        await refundGameStake(userId, {
          gameKey: "hilo",
          amount: betAmount,
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
        game: hiloGame,
        message: "New game created",
        newBalance: debit.balance,
        walletType: resolvedWalletType,
      };
    } catch (error) {
      console.error("Join game error:", error);
      return { error: "An error occurred while joining the game" };
    }
  },

  async getActiveGame(userId) {
    try {
      const hiloGame = await Hilo.findOne({ userId });
      return hiloGame ? { success: true, game: hiloGame } : { success: false };
    } catch (error) {
      console.error("Get active game error:", error);
      return { error: "An error occurred while fetching game" };
    }
  },

  async predict(userId, prediction) {
    try {
      const hiloGame = await Hilo.findOne({ userId });
      if (!hiloGame) {
        return { error: "No game found" };
      }

      if (hiloGame.gameOver || hiloGame.checkedOut) {
        return { error: "Game is already over" };
      }

      const newCard = getRandomCard();
      const currentValueIndex = getValueIndex(hiloGame.currentCard.value);
      const newValueIndex = getValueIndex(newCard.value);

      let result;
      let isCorrect;

      if (prediction === "high") {
        isCorrect = newValueIndex >= currentValueIndex;
        result = isCorrect ? "high-true" : "high-false";
      } else {
        isCorrect = newValueIndex <= currentValueIndex;
        result = isCorrect ? "low-true" : "low-false";
      }

      // Update game state
      hiloGame.currentCard = newCard;
      hiloGame.historyCards.push({ ...newCard, result });

      if (!isCorrect) {
        hiloGame.gameOver = true;
        hiloGame.loss = hiloGame.betAmount;
        await hiloGame.deleteOne();
      } else {
        // Increase multiplier for each correct prediction
        hiloGame.multiplier += 0.1;
        await hiloGame.save();
      }

      return {
        success: true,
        game: hiloGame,
        result,
        isCorrect,
      };
    } catch (error) {
      console.error("Predict error:", error);
      return { error: "An error occurred while making prediction" };
    }
  },

  async skip(userId) {
    try {
      const hiloGame = await Hilo.findOne({ userId });
      if (!hiloGame) {
        return { error: "No game found" };
      }

      if (hiloGame.gameOver || hiloGame.checkedOut) {
        return { error: "Game is already over" };
      }

      const newCard = getRandomCard();
      hiloGame.currentCard = newCard;
      hiloGame.historyCards.push({ ...newCard, result: null });
      await hiloGame.save();

      return {
        success: true,
        game: hiloGame,
      };
    } catch (error) {
      console.error("Skip error:", error);
      return { error: "An error occurred while skipping" };
    }
  },

  async checkout(userId) {
    try {
      const hiloGame = await Hilo.findOne({ userId });
      if (!hiloGame) {
        return { error: "No game found" };
      }

      if (hiloGame.gameOver || hiloGame.checkedOut) {
        return { error: "Game is already over" };
      }

      // Calculate profit based on multiplier
      const profit = (
        parseFloat(hiloGame.betAmount) * hiloGame.multiplier
      ).toFixed(6);
      hiloGame.profit = profit;
      hiloGame.checkedOut = true;
      hiloGame.gameWon = true;

      // Claim the round atomically: only the caller that actually deletes
      // the round document credits the cashout, so a double checkout (or a
      // checkout racing a losing predict) can never pay twice.
      const claimed = await Hilo.findOneAndDelete({ _id: hiloGame._id });
      if (!claimed) {
        return { error: "Game is already over" };
      }

      const walletType = claimed.walletType || "demo";
      // Credit the total payout (multiplier starts at 1.0, so it includes
      // the stake).
      const credit = await creditGameWin(userId, {
        gameKey: "hilo",
        amount: Number(profit),
        walletType,
      });

      return {
        success: true,
        profit,
        multiplier: hiloGame.multiplier,
        newBalance: credit.balance,
        walletType,
      };
    } catch (error) {
      console.error("Checkout error:", error);
      return { error: "An error occurred while checking out" };
    }
  },
};

export default service;
