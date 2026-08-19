import User from "../../../models/user.model.js";
import Game from "../../../models/game.model.js";
import parachuteGame from "./parachute.game.js";
import {
  debitGameStake,
  creditGameWin,
  refundGameStake,
  resolveGameWalletType,
} from "../../../services/casinoWallet.service.js";

const service = {
  async join(userId, betAmount, difficulty, walletType = "demo") {
    try {
      const game = await Game.findOne({ name: "parachute" });
      if (!game) {
        return { error: "Game not found" };
      }

      const user = await User.findById(userId);
      if (!user) {
        return { error: "User not found" };
      }

      const resolvedWalletType = resolveGameWalletType(walletType);

      // Debit the stake exactly once, when the player commits to the round.
      // A crash keeps this debit; a checkout credits stake x multiplier.
      const debit = await debitGameStake(userId, {
        gameKey: "parachute",
        amount: betAmount,
        walletType: resolvedWalletType,
      });
      if (debit.error) {
        return { error: debit.error };
      }

      // Update user's game history
      const gameIndex = user.continuedGames.findIndex(
        (gameId) => gameId.toString() === game._id.toString()
      );

      if (gameIndex !== -1) {
        user.continuedGames.splice(gameIndex, 1);
      }
      user.continuedGames.unshift(game._id);
      game.gamesPlayed = game.gamesPlayed + 1;

      // Start the game
      const gameResult = parachuteGame.startGame(
        userId,
        betAmount,
        difficulty,
        resolvedWalletType
      );
      if (gameResult.error) {
        // The round never started: hand the stake back.
        await refundGameStake(userId, {
          gameKey: "parachute",
          amount: debit.stake,
          walletType: resolvedWalletType,
        });
        return gameResult;
      }

      await user.save();
      await game.save();

      return {
        success: true,
        gameState: gameResult.gameState,
        newBalance: debit.balance,
      };
    } catch (error) {
      console.error("Join game error:", error);
      return { error: "An error occurred while joining the game" };
    }
  },

  async checkout(userId) {
    try {
      const gameState = parachuteGame.getGameState(userId);
      if (!gameState) {
        return { error: "No active game found" };
      }

      const walletType = gameState.walletType || "demo";

      // parachuteGame.checkout is the exactly-once guard: it rejects a
      // crashed or already-checked-out round and synchronously removes the
      // game from activeGames, so a second checkout finds no active game.
      const checkoutResult = parachuteGame.checkout(userId);
      if (checkoutResult.error) {
        return checkoutResult;
      }

      // Credit the total payout (stake x cashout multiplier) exactly once.
      const credit = await creditGameWin(userId, {
        gameKey: "parachute",
        amount: checkoutResult.winAmount,
        walletType,
      });

      return {
        success: true,
        ...checkoutResult,
        newBalance: credit.balance,
        walletType,
      };
    } catch (error) {
      console.error("Checkout error:", error);
      return { error: "An error occurred during checkout" };
    }
  },

  async handleCrash(userId) {
    try {
      const gameState = parachuteGame.getGameState(userId);
      if (!gameState) {
        return { error: "No active game found" };
      }

      const finalState = parachuteGame.stopGame(userId);
      if (!finalState) {
        return { error: "Failed to process crash" };
      }

      // Update user statistics if needed
      const user = await User.findById(userId);
      if (user) {
        // You might want to update user statistics here
        // For example: total games played, total losses, etc.
        await user.save();
      }

      return {
        success: true,
        ...finalState,
      };
    } catch (error) {
      console.error("Crash handling error:", error);
      return { error: "An error occurred while processing crash" };
    }
  },
};

export default service;
