import User from "../../../models/user.model.js";
import Game from "../../../models/game.model.js";
import Baccarat from "../../../models/games/baccarat.model.js";
import mongoose from "mongoose";
import {
  debitGameStake,
  creditGameWin,
  refundGameStake,
  getGameBalance,
  resolveGameWalletType,
} from "../../../services/casinoWallet.service.js";
import {
  createSeedRecordPayload,
  takeFairnessFloats,
} from "../../../services/provablyFair.service.js";
import {
  BACCARAT_EVENT_COUNT,
  buildCardFairnessPayload,
  cardsFromFloats,
  toBaccaratCard,
} from "../../../services/cardFairness.js";

const buildBaccaratShoe = () => {
  const payload = createSeedRecordPayload({
    gameKey: "baccarat",
    clientSeed: "baccarat-public",
  });
  const floats = takeFairnessFloats({
    serverSeed: payload.serverSeed,
    clientSeed: payload.clientSeed,
    nonce: 0,
    count: BACCARAT_EVENT_COUNT,
  });
  return {
    deck: cardsFromFloats(floats).map(toBaccaratCard),
    nonce: 0,
    clientSeed: payload.clientSeed,
    serverSeed: payload.serverSeed,
    serverSeedHash: payload.serverSeedHash,
  };
};

const serializeBaccarat = (game, { includeDeck = false } = {}) => {
  const completed = game.status === "completed";
  return {
    gameId: game.gameId,
    status: game.status,
    currentRound: game.currentRound,
    playerCards: game.playerCards,
    bankerCards: game.bankerCards,
    playerScore: game.playerScore,
    bankerScore: game.bankerScore,
    winner: game.winner,
    bets: game.bets,
    ...(includeDeck ? { deck: game.deck } : {}),
    fairness: buildCardFairnessPayload(
      {
        gameKey: "baccarat",
        nonce: game.nonce,
        clientSeed: game.clientSeed,
        serverSeedHash: game.serverSeedHash,
        serverSeed: game.serverSeed,
        dealIndex: (game.playerCards?.length || 0) + (game.bankerCards?.length || 0),
      },
      { revealServerSeed: completed }
    ),
  };
};

const service = {
  async join(userId) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Find or create active game
      let game = await Baccarat.findOne({
        status: { $in: ["waiting", "betting"] },
      });

      if (!game) {
        const shoe = buildBaccaratShoe();
        game = new Baccarat({
          gameId: `baccarat_${Date.now()}`,
          status: "waiting",
          deck: shoe.deck,
          nonce: shoe.nonce,
          clientSeed: shoe.clientSeed,
          serverSeed: shoe.serverSeed,
          serverSeedHash: shoe.serverSeedHash,
        });
        await game.save({ session });
      }

      // Update user's continued games
      const user = await User.findById(userId);
      if (!user) {
        throw new Error("User not found");
      }

      const gameModel = await Game.findOne({ name: "baccarat" });
      if (!gameModel) {
        throw new Error("Game not found");
      }

      const gameIndex = user.continuedGames.findIndex(
        (gameId) => gameId.toString() === gameModel._id.toString()
      );

      if (gameIndex !== -1) {
        user.continuedGames.splice(gameIndex, 1);
      }
      user.continuedGames.unshift(gameModel._id);
      gameModel.gamesPlayed = gameModel.gamesPlayed + 1;

      await user.save({ session });
      await gameModel.save({ session });
      await session.commitTransaction();

      return {
        success: true,
        ...serializeBaccarat(game),
      };
    } catch (error) {
      await session.abortTransaction();
      throw new Error(
        error.message || "An error occurred while joining the game"
      );
    } finally {
      session.endSession();
    }
  },

  async placeBet(userId, gameId, betType, amount, walletType = "demo") {
    try {
      // Accept "waiting" too: betting opens the moment the first stake lands
      // (the round is created as "waiting" and nothing else flips it).
      const game = await Baccarat.findOne({
        gameId,
        status: { $in: ["waiting", "betting"] },
      });
      if (!game) {
        throw new Error("Game not found or betting is closed");
      }

      const user = await User.findById(userId);
      if (!user) {
        throw new Error("User not found");
      }

      const resolvedWalletType = resolveGameWalletType(walletType);

      // Debit the stake from the wallet (atomic, balance-floor guarded).
      const debit = await debitGameStake(userId, {
        gameKey: "baccarat",
        amount,
        walletType: resolvedWalletType,
      });
      if (debit.error) {
        throw new Error(debit.error);
      }

      // Add bet to game
      game.bets.push({
        userId: user._id,
        type: betType,
        amount: amount,
        status: "pending",
        walletType: resolvedWalletType,
      });
      game.status = "betting";

      try {
        await game.save();
      } catch (saveError) {
        // The bet never landed on the table: give the stake back.
        await refundGameStake(userId, {
          gameKey: "baccarat",
          amount,
          walletType: resolvedWalletType,
        });
        throw saveError;
      }

      return {
        success: true,
        newBalance: debit.balance,
        walletType: resolvedWalletType,
        game: serializeBaccarat(game),
      };
    } catch (error) {
      throw new Error(error.message || "An error occurred while placing bet");
    }
  },

  async dealCards(gameId) {
    try {
      const game = await Baccarat.findOne({ gameId, status: "betting" });
      if (!game) {
        throw new Error("Game not found or not in betting phase");
      }

      // Claim the deal atomically so two racing start_dealing events can
      // never settle (and pay) the same round twice.
      const claimed = await Baccarat.findOneAndUpdate(
        { _id: game._id, status: "betting" },
        { $set: { status: "dealing" } }
      );
      if (!claimed) {
        throw new Error("Game not found or not in betting phase");
      }
      game.status = "dealing";

      // Deal initial cards (2 each)
      game.playerCards = game.deck.splice(0, 2);
      game.bankerCards = game.deck.splice(0, 2);

      // Calculate scores
      game.calculateScores();

      // Determine if third card is needed based on Baccarat rules
      // This is a simplified version - you might want to add more complex rules
      if (game.playerScore <= 5) {
        game.playerCards.push(game.deck.splice(0, 1)[0]);
      }
      if (game.bankerScore <= 5) {
        game.bankerCards.push(game.deck.splice(0, 1)[0]);
      }

      // Recalculate scores after third card
      game.calculateScores();
      game.determineWinner();
      game.processPayouts();

      game.status = "completed";
      game.endTime = new Date();

      await game.save();

      // Credit each winning bet's total payout back to the wallet it was
      // staked from. Losing bets keep their debit. Track the resulting
      // balance per bettor so the socket layer can report newBalance.
      const balances = {};
      for (const bet of game.bets) {
        const key = String(bet.userId);
        const betWalletType = bet.walletType || "demo";
        if (bet.status === "won" && bet.payout > 0) {
          const credit = await creditGameWin(bet.userId, {
            gameKey: "baccarat",
            amount: bet.payout,
            walletType: betWalletType,
          });
          balances[key] = credit.balance;
        } else if (!(key in balances)) {
          balances[key] = await getGameBalance(bet.userId, betWalletType);
        }
      }

      return {
        success: true,
        balances,
        game: serializeBaccarat(game),
      };
    } catch (error) {
      throw new Error(error.message || "An error occurred while dealing cards");
    }
  },

  async startNewRound(gameId) {
    try {
      const game = await Baccarat.findOne({ gameId });
      if (!game) {
        throw new Error("Game not found");
      }

      const shoe = buildBaccaratShoe();
      const newGame = new Baccarat({
        gameId: `baccarat_${Date.now()}`,
        status: "waiting",
        currentRound: game.currentRound + 1,
        deck: shoe.deck,
        nonce: shoe.nonce,
        clientSeed: shoe.clientSeed,
        serverSeed: shoe.serverSeed,
        serverSeedHash: shoe.serverSeedHash,
      });

      await newGame.save();

      return {
        success: true,
        game: serializeBaccarat(newGame),
      };
    } catch (error) {
      throw new Error(
        error.message || "An error occurred while starting new round"
      );
    }
  },
};

export default service;
