import User from "../../../models/user.model.js";
import Game from "../../../models/game.model.js";
import {
  debitGameStake,
  creditGameWin,
  getGameBalance,
} from "../../../services/casinoWallet.service.js";
import { consumeGameFloats } from "../../../services/fairnessConsume.service.js";
import {
  deriveRiskMultiplier,
  rtpForMultiplierRisk,
} from "../../../services/provablyFair.service.js";
import pumpGame from "./pump.game.js";
import { normalizeRisk } from "./pump.ladders.js";

const userHistories = new Map();
const HISTORY_MAX = 50;

const userKey = (userId) => String(userId);

const getHistory = (userId) => userHistories.get(userKey(userId)) || [];

const appendHistory = (userId, value) => {
  const normalized = Math.floor(Number(value) * 100) / 100;
  if (!Number.isFinite(normalized)) return null;

  const entry = {
    id: Date.now(),
    value: normalized,
    timestamp: new Date().toISOString(),
  };
  const list = getHistory(userId);
  userHistories.set(userKey(userId), [entry, ...list].slice(0, HISTORY_MAX));
  return entry;
};

const recordRoundHistory = (userId, value) => appendHistory(userId, value);

const service = {
  getHistory,

  async join(userId) {
    try {
      const game = await Game.findOne({ name: "pump" });
      if (!game) {
        return { error: "Game not found" };
      }

      const user = await User.findById(userId);
      if (!user) {
        return { error: "User not found" };
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
      return { success: true };
    } catch (error) {
      return { error: "An error occurred while joining the game" };
    }
  },

  async startRound(userId, betAmount, risk = "Low", walletType = "demo") {
    if (pumpGame.getGameState(userId)) {
      return { error: "Game already in progress" };
    }

    const debit = await debitGameStake(userId, {
      gameKey: "pump",
      amount: betAmount,
      walletType,
    });
    if (debit.error) {
      return { error: debit.error };
    }

    const fairness = await consumeGameFloats({
      userId,
      gameKey: "pump",
    });
    const resolvedRisk = normalizeRisk(risk);
    const popAt = deriveRiskMultiplier(fairness.floats[0], resolvedRisk);

    const started = pumpGame.startRound(userId, {
      betAmount: debit.stake,
      walletType: debit.walletType || walletType,
      risk: resolvedRisk,
      popAt,
      fairness: {
        gameKey: "pump",
        nonce: fairness.nonce,
        clientSeed: fairness.clientSeed,
        serverSeedHash: fairness.serverSeedHash,
        risk: resolvedRisk,
        rtp: rtpForMultiplierRisk(resolvedRisk),
      },
    });

    if (started.error) {
      return started;
    }

    return {
      success: true,
      betAmount: debit.stake,
      newBalance: debit.balance,
      walletType: debit.walletType || walletType,
      ...started.gameState,
      fairness: {
        gameKey: "pump",
        nonce: fairness.nonce,
        clientSeed: fairness.clientSeed,
        serverSeedHash: fairness.serverSeedHash,
        risk: resolvedRisk,
        rtp: rtpForMultiplierRisk(resolvedRisk),
      },
    };
  },

  pump(userId) {
    return pumpGame.pump(userId);
  },

  async cashOut(userId) {
    const result = pumpGame.checkout(userId);
    if (result.error) {
      return result;
    }

    const credit = await creditGameWin(userId, {
      gameKey: "pump",
      amount: result.winAmount,
      walletType: result.walletType,
    });

    // Parachute pattern: history stores the server-generated bust point (popAt).
    recordRoundHistory(userId, result.popAt);

    return {
      success: true,
      multiplier: result.multiplier,
      popAt: result.popAt,
      payout: result.winAmount,
      newBalance: credit.balance,
      walletType: result.walletType,
      history: getHistory(userId),
      fairness: {
        ...(result.fairness || {}),
        popAt: result.popAt,
      },
    };
  },

  async settlePop(userId, poppedMultiplier) {
    const round = pumpGame.peekRound(userId);
    const forfeit = pumpGame.forfeit(userId);

    const popAt = forfeit?.popAt ?? round?.popAt;
    const fairness = forfeit?.fairness ?? round?.fairness ?? null;
    const multiplier =
      poppedMultiplier ?? forfeit?.multiplier ?? round?.currentMultiplier;
    const walletType = forfeit?.walletType ?? round?.walletType ?? "demo";

    const bustMultiplier = Math.floor(Number(multiplier) * 100) / 100;
    if (!Number.isFinite(bustMultiplier)) {
      return { success: true, hadBet: false };
    }

    // Blast history: ladder multiplier where the balloon popped.
    recordRoundHistory(userId, bustMultiplier);

    const resolvedPopAt = Number.isFinite(Number(popAt))
      ? Math.floor(Number(popAt) * 100) / 100
      : null;

    const newBalance = await getGameBalance(userId, walletType);
    return {
      success: true,
      hadBet: true,
      popAt: resolvedPopAt,
      multiplier: bustMultiplier,
      newBalance,
      walletType,
      history: getHistory(userId),
      fairness: {
        ...(fairness || {}),
        popAt: resolvedPopAt,
      },
    };
  },

  async bust(userId, poppedMultiplier) {
    return this.settlePop(userId, poppedMultiplier);
  },

  clearBet(userId) {
    pumpGame.clearRound(userId);
  },
};

export default service;
