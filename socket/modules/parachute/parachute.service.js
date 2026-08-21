import User from "../../../models/user.model.js";
import Game from "../../../models/game.model.js";
import { io } from "../../socket.js";
import parachuteGame from "./parachute.game.js";
import {
  debitGameStake,
  creditGameWin,
  refundGameStake,
  resolveGameWalletType,
} from "../../../services/casinoWallet.service.js";
import {
  createHouseStream,
  deriveCrashPoint,
} from "../../../services/provablyFair.service.js";

const houseStream = createHouseStream("parachute");
const userHistories = new Map();
const HISTORY_MAX = 50;

const getHistory = (userId) => userHistories.get(userId) || [];

const appendHistory = (userId, value) => {
  const normalized = Math.floor(Number(value) * 100) / 100;
  if (!Number.isFinite(normalized)) return null;

  const entry = {
    id: Date.now(),
    value: normalized,
    timestamp: new Date().toISOString(),
  };
  const list = getHistory(userId);
  userHistories.set(userId, [entry, ...list].slice(0, HISTORY_MAX));
  return entry;
};

const recordRoundHistory = (userId, crashPoint) => appendHistory(userId, crashPoint);

const emitCrash = (userId, multiplier, notifyClient = null) => {
  const payload = {
    multiplier,
    isCrashed: true,
    history: getHistory(userId),
  };

  if (notifyClient) {
    notifyClient(payload);
    return;
  }

  io.of("/parachute")
    .to(`parachute:${String(userId)}`)
    .emit("game_crashed", payload);
};

const service = {
  getHistory,

  async join(userId, betAmount, difficulty, walletType = "demo", notifyClient = null) {
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

      const debit = await debitGameStake(userId, {
        gameKey: "parachute",
        amount: betAmount,
        walletType: resolvedWalletType,
      });
      if (debit.error) {
        return { error: debit.error };
      }

      const gameIndex = user.continuedGames.findIndex(
        (gameId) => gameId.toString() === game._id.toString()
      );

      if (gameIndex !== -1) {
        user.continuedGames.splice(gameIndex, 1);
      }
      user.continuedGames.unshift(game._id);
      game.gamesPlayed = game.gamesPlayed + 1;

      const { floats } = houseStream.next(1);
      const crashPoint = deriveCrashPoint(floats[0]);

      const onCrash = ({ multiplier }) => {
        recordRoundHistory(userId, multiplier);
        emitCrash(userId, multiplier, notifyClient);
      };

      const gameResult = parachuteGame.startGame(
        userId,
        betAmount,
        difficulty,
        resolvedWalletType,
        crashPoint,
        onCrash
      );
      if (gameResult.error) {
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
      const crashPoint = Math.floor(Number(gameState.crashPoint) * 100) / 100;

      const checkoutResult = parachuteGame.checkout(userId);
      if (checkoutResult.error) {
        return checkoutResult;
      }

      const resolvedCrashPoint = Number.isFinite(Number(checkoutResult.crashPoint))
        ? Math.floor(Number(checkoutResult.crashPoint) * 100) / 100
        : crashPoint;

      recordRoundHistory(userId, resolvedCrashPoint);

      const credit = await creditGameWin(userId, {
        gameKey: "parachute",
        amount: checkoutResult.winAmount,
        walletType,
      });

      return {
        success: true,
        ...checkoutResult,
        crashPoint: resolvedCrashPoint,
        newBalance: credit.balance,
        walletType,
        history: getHistory(userId),
      };
    } catch (error) {
      console.error("Checkout error:", error);
      return { error: "An error occurred during checkout" };
    }
  },

  async forfeit(userId) {
    try {
      const gameState = parachuteGame.getGameState(userId);
      if (!gameState || gameState.hasCheckedOut) {
        return { error: "No active game found" };
      }

      const finalState = parachuteGame.forfeitGame(userId);
      if (!finalState) {
        return { error: "Failed to process crash" };
      }

      return {
        success: true,
        ...finalState,
      };
    } catch (error) {
      console.error("Forfeit error:", error);
      return { error: "An error occurred while processing crash" };
    }
  },
};

export default service;
