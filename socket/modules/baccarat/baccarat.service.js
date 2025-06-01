import User from "../../../models/user.model.js";
import Game from "../../../models/game.model.js";
import Baccarat from "../../../models/games/baccarat.model.js";
import mongoose from "mongoose";

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
        game = new Baccarat({
          gameId: `baccarat_${Date.now()}`,
          status: "waiting",
        });
        game.createNewDeck();
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
        gameId: game.gameId,
        status: game.status,
        currentRound: game.currentRound,
        deck: game.deck,
        playerCards: game.playerCards,
        bankerCards: game.bankerCards,
        playerScore: game.playerScore,
        bankerScore: game.bankerScore,
        winner: game.winner,
        bets: game.bets,
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

  async placeBet(userId, gameId, betType, amount) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const game = await Baccarat.findOne({ gameId, status: "betting" });
      if (!game) {
        throw new Error("Game not found or betting is closed");
      }

      const user = await User.findById(userId);
      if (!user) {
        throw new Error("User not found");
      }

      if (user.balance < amount) {
        throw new Error("Insufficient balance");
      }

      // Add bet to game
      game.bets.push({
        userId: user._id,
        type: betType,
        amount: amount,
        status: "pending",
      });

      // Deduct amount from user balance
      user.balance -= amount;

      await game.save({ session });
      await user.save({ session });
      await session.commitTransaction();

      return {
        success: true,
        game: {
          gameId: game.gameId,
          status: game.status,
          bets: game.bets,
          playerCards: game.playerCards,
          bankerCards: game.bankerCards,
          playerScore: game.playerScore,
          bankerScore: game.bankerScore,
          winner: game.winner,
        },
      };
    } catch (error) {
      await session.abortTransaction();
      throw new Error(error.message || "An error occurred while placing bet");
    } finally {
      session.endSession();
    }
  },

  async dealCards(gameId) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const game = await Baccarat.findOne({ gameId, status: "betting" });
      if (!game) {
        throw new Error("Game not found or not in betting phase");
      }

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

      // Update user balances
      for (const bet of game.bets) {
        const user = await User.findById(bet.userId);
        if (user && bet.status === "won") {
          user.balance += bet.payout;
          await user.save({ session });
        }
      }

      game.status = "completed";
      game.endTime = new Date();

      await game.save({ session });
      await session.commitTransaction();

      return {
        success: true,
        game: {
          gameId: game.gameId,
          status: game.status,
          playerCards: game.playerCards,
          bankerCards: game.bankerCards,
          playerScore: game.playerScore,
          bankerScore: game.bankerScore,
          winner: game.winner,
          bets: game.bets,
        },
      };
    } catch (error) {
      await session.abortTransaction();
      throw new Error(error.message || "An error occurred while dealing cards");
    } finally {
      session.endSession();
    }
  },

  async startNewRound(gameId) {
    try {
      const game = await Baccarat.findOne({ gameId });
      if (!game) {
        throw new Error("Game not found");
      }

      // Create new game instance
      const newGame = new Baccarat({
        gameId: `baccarat_${Date.now()}`,
        status: "waiting",
        currentRound: game.currentRound + 1,
      });

      newGame.createNewDeck();
      await newGame.save();

      return {
        success: true,
        game: {
          gameId: newGame.gameId,
          status: newGame.status,
          currentRound: newGame.currentRound,
          deck: newGame.deck,
        },
      };
    } catch (error) {
      throw new Error(
        error.message || "An error occurred while starting new round"
      );
    }
  },
};

export default service;
