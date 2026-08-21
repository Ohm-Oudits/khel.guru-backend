import User from "../../../models/user.model.js";
import Game from "../../../models/game.model.js";
import Hilo from "../../../models/games/hilo.model.js";
import {
  debitGameStake,
  creditGameWin,
  refundGameStake,
  resolveGameWalletType,
} from "../../../services/casinoWallet.service.js";
import { consumeGameFloats } from "../../../services/fairnessConsume.service.js";
import {
  HILO_BLACKJACK_EVENT_COUNT,
  buildCardFairnessPayload,
  cardsFromFloats,
  toHiloCard,
} from "../../../services/cardFairness.js";
import { applyPickMultiplier, getHiloOdds, pickFactor } from "./hilo.odds.js";

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

const getValueIndex = (value) => CARD_VALUES.indexOf(value);

const serializeHilo = (game, extra = {}) => {
  const obj = game.toObject ? game.toObject() : { ...game };
  delete obj.shoe;
  return {
    ...obj,
    fairness: buildCardFairnessPayload({
      gameKey: "hilo",
      nonce: obj.nonce,
      clientSeed: obj.clientSeed,
      serverSeedHash: obj.serverSeedHash,
      dealIndex: obj.dealIndex,
    }),
    ...extra,
  };
};

const nextCard = (game) => {
  if (!Array.isArray(game.shoe) || game.dealIndex >= game.shoe.length) {
    throw new Error("Card shoe exhausted");
  }
  const card = game.shoe[game.dealIndex];
  game.dealIndex += 1;
  return card;
};

const isPreviewRound = (game) => game?.stakeLocked === false;

const isOpenRound = (game) =>
  Boolean(game) && !game.gameOver && !game.checkedOut;

const dealPreviewShoe = async (userId) => {
  const fairness = await consumeGameFloats({
    userId,
    gameKey: "hilo",
    count: HILO_BLACKJACK_EVENT_COUNT,
  });
  const shoe = cardsFromFloats(fairness.floats).map(toHiloCard);
  const initialCard = shoe[0];
  return Hilo.create({
    userId,
    currentCard: initialCard,
    historyCards: [{ ...initialCard, result: null }],
    betAmount: "0",
    multiplier: 1.0,
    stakeLocked: false,
    shoe,
    dealIndex: 1,
    nonce: fairness.nonce,
    clientSeed: fairness.clientSeed,
    serverSeedHash: fairness.serverSeedHash,
  });
};

const touchContinuedGames = async (userId, catalogGame) => {
  const user = await User.findById(userId);
  if (!user) return;
  const gameIndex = user.continuedGames.findIndex(
    (gameId) => gameId.toString() === catalogGame._id.toString()
  );
  if (gameIndex !== -1) {
    user.continuedGames.splice(gameIndex, 1);
  }
  user.continuedGames.unshift(catalogGame._id);
  catalogGame.gamesPlayed = catalogGame.gamesPlayed + 1;
  await user.save();
  await catalogGame.save();
};

const service = {
  async shufflePreview(userId) {
    try {
      const catalogGame = await Game.findOne({ name: "hilo" });
      if (!catalogGame) {
        return { error: "Game not found" };
      }

      const existingGame = await Hilo.findOne({ userId });
      if (isOpenRound(existingGame) && !isPreviewRound(existingGame)) {
        return { error: "Round already started" };
      }

      if (
        isPreviewRound(existingGame) &&
        isOpenRound(existingGame) &&
        existingGame.dealIndex < existingGame.shoe.length
      ) {
        const newCard = nextCard(existingGame);
        existingGame.currentCard = newCard;
        existingGame.historyCards = [{ ...newCard, result: null }];
        await existingGame.save();
        return { success: true, game: serializeHilo(existingGame) };
      }

      if (existingGame) {
        await existingGame.deleteOne();
      }

      const preview = await dealPreviewShoe(userId);
      return { success: true, game: serializeHilo(preview) };
    } catch (error) {
      console.error("Shuffle preview error:", error);
      return { error: "An error occurred while shuffling" };
    }
  },

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

      const existingGame = await Hilo.findOne({ userId });
      if (isOpenRound(existingGame) && !isPreviewRound(existingGame)) {
        return {
          success: true,
          hasActiveGame: true,
          game: serializeHilo(existingGame),
          message: "Existing game found",
        };
      }

      const resolvedWalletType = resolveGameWalletType(walletType);

      // Debit the stake exactly once, when the round is locked.
      const debit = await debitGameStake(userId, {
        gameKey: "hilo",
        amount: betAmount,
        walletType: resolvedWalletType,
      });
      if (debit.error) {
        return { error: debit.error };
      }

      if (isPreviewRound(existingGame) && isOpenRound(existingGame)) {
        try {
          existingGame.betAmount = String(betAmount);
          existingGame.walletType = resolvedWalletType;
          existingGame.stakeLocked = true;
          existingGame.multiplier = 1.0;
          await existingGame.save();
          await touchContinuedGames(userId, game);
        } catch (lockError) {
          await refundGameStake(userId, {
            gameKey: "hilo",
            amount: betAmount,
            walletType: resolvedWalletType,
          });
          throw lockError;
        }
        return {
          success: true,
          hasActiveGame: false,
          game: serializeHilo(existingGame),
          message: "New game created",
          newBalance: debit.balance,
          walletType: resolvedWalletType,
        };
      }

      if (existingGame) {
        await existingGame.deleteOne();
      }

      const fairness = await consumeGameFloats({
        userId,
        gameKey: "hilo",
        count: HILO_BLACKJACK_EVENT_COUNT,
      });
      const shoe = cardsFromFloats(fairness.floats).map(toHiloCard);
      const initialCard = shoe[0];
      let hiloGame;
      try {
        hiloGame = await Hilo.create({
          userId,
          currentCard: initialCard,
          historyCards: [{ ...initialCard, result: null }],
          betAmount,
          multiplier: 1.0,
          stakeLocked: true,
          walletType: resolvedWalletType,
          shoe,
          dealIndex: 1,
          nonce: fairness.nonce,
          clientSeed: fairness.clientSeed,
          serverSeedHash: fairness.serverSeedHash,
        });
      } catch (createError) {
        await refundGameStake(userId, {
          gameKey: "hilo",
          amount: betAmount,
          walletType: resolvedWalletType,
        });
        throw createError;
      }

      await touchContinuedGames(userId, game);

      return {
        success: true,
        hasActiveGame: false,
        game: serializeHilo(hiloGame),
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
      return hiloGame
        ? { success: true, game: serializeHilo(hiloGame) }
        : { success: false };
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

      if (isPreviewRound(hiloGame)) {
        return { error: "Place a bet first" };
      }

      const odds = getHiloOdds(hiloGame.currentCard.value);
      const chance =
        prediction === "high" ? odds.high.chance : odds.low.chance;

      const newCard = nextCard(hiloGame);
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

      hiloGame.currentCard = newCard;
      hiloGame.historyCards.push({ ...newCard, result });

      if (!isCorrect) {
        hiloGame.gameOver = true;
        hiloGame.multiplier = 0;
        hiloGame.loss = hiloGame.betAmount;
        await hiloGame.deleteOne();
      } else {
        hiloGame.multiplier = applyPickMultiplier(
          hiloGame.multiplier,
          pickFactor(chance)
        );
        await hiloGame.save();
      }

      return {
        success: true,
        game: serializeHilo(hiloGame),
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

      if (isPreviewRound(hiloGame)) {
        return { error: "Place a bet first" };
      }

      const newCard = nextCard(hiloGame);
      hiloGame.currentCard = newCard;
      hiloGame.historyCards.push({ ...newCard, result: null });
      await hiloGame.save();

      return {
        success: true,
        game: serializeHilo(hiloGame),
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

      if (isPreviewRound(hiloGame)) {
        return { error: "Place a bet first" };
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
        fairness: buildCardFairnessPayload({
          gameKey: "hilo",
          nonce: claimed.nonce,
          clientSeed: claimed.clientSeed,
          serverSeedHash: claimed.serverSeedHash,
          dealIndex: claimed.dealIndex,
        }),
      };
    } catch (error) {
      console.error("Checkout error:", error);
      return { error: "An error occurred while checking out" };
    }
  },
};

export default service;
