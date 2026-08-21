import User from "../../../models/user.model.js";
import Game from "../../../models/game.model.js";
import {
  debitGameStake,
  creditGameWin,
  resolveGameWalletType,
} from "../../../services/casinoWallet.service.js";
import { consumeGameFloats } from "../../../services/fairnessConsume.service.js";
import { floatsToPlinkoPath, pathToBin } from "../../../services/provablyFair.service.js";
import {
  getPlinkoTable,
  normalizePlinkoRows,
  PLINKO_FAIRNESS_FORMULA,
  settlePlinkoDrop,
} from "./plinko.payouts.js";

const takePlinkoOutcome = async (userId, rows) => {
  const n = normalizePlinkoRows(rows);
  const consumed = await consumeGameFloats({
    userId,
    gameKey: "plinko",
    count: n,
  });
  const path = floatsToPlinkoPath(consumed.floats);
  const bin = pathToBin(path);

  return {
    path,
    bin,
    nonce: consumed.nonce,
    clientSeed: consumed.clientSeed,
    serverSeedHash: consumed.serverSeedHash,
  };
};

const pendingDrops = new Map();

const dropKey = (userId, dropId) => `${userId}:${dropId}`;

const service = {
  async join(userId) {
    try {
      const game = await Game.findOne({ name: "plinko" });
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

  async drop(userId, data) {
    try {
      if (!userId) {
        return { error: "Authentication required" };
      }

      const joined = await this.join(userId);
      if (joined.error) {
        return { error: joined.error, dropId: data?.dropId };
      }

      const { dropId, betAmount, rows, risk, walletType } = data || {};
      const table = getPlinkoTable(rows, risk);
      if (!dropId || !table) {
        return { error: "Invalid plinko parameters" };
      }

      const resolvedWalletType = resolveGameWalletType(walletType);
      const debit = await debitGameStake(userId, {
        gameKey: "plinko",
        amount: betAmount,
        walletType: resolvedWalletType,
      });
      if (debit.error) {
        return { error: debit.error, dropId };
      }

      const outcome = await takePlinkoOutcome(userId, rows);
      const settled = settlePlinkoDrop({
        betAmount: debit.stake,
        rows,
        risk,
        bin: outcome.bin,
      });
      if (settled.multiplier == null) {
        return { error: "Invalid plinko result", dropId };
      }

      const fairness = {
        nonce: outcome.nonce,
        clientSeed: outcome.clientSeed,
        serverSeedHash: outcome.serverSeedHash,
        rows,
        risk,
        path: outcome.path,
        bin: outcome.bin,
        multiplier: settled.multiplier,
        formula: PLINKO_FAIRNESS_FORMULA,
      };

      pendingDrops.set(dropKey(userId, dropId), {
        betAmount: debit.stake,
        multiplier: settled.multiplier,
        bin: outcome.bin,
        path: outcome.path,
        walletType: resolvedWalletType,
        payout: settled.payout,
        fairness,
      });

      return {
        success: true,
        data: {
          dropId,
          bin: outcome.bin,
          path: outcome.path,
          multiplier: settled.multiplier,
          betAmount: debit.stake,
          walletType: resolvedWalletType,
          ...fairness,
        },
      };
    } catch (error) {
      console.error("Plinko drop error:", error);
      return { error: "An error occurred while dropping the ball" };
    }
  },

  async settle(userId, data) {
    try {
      const dropId = data?.dropId;
      if (!userId || !dropId) {
        return { error: "Invalid settle" };
      }

      const key = dropKey(userId, dropId);
      const pending = pendingDrops.get(key);
      if (!pending) {
        return { error: "Drop not found", dropId };
      }
      pendingDrops.delete(key);

      const credit = await creditGameWin(userId, {
        gameKey: "plinko",
        amount: pending.payout,
        walletType: pending.walletType,
      });

      return {
        success: true,
        data: {
          dropId,
          bin: pending.bin,
          path: pending.path,
          multiplier: pending.multiplier,
          payout: pending.payout,
          betAmount: pending.betAmount,
          fairness: pending.fairness,
          nonce: pending.fairness.nonce,
          clientSeed: pending.fairness.clientSeed,
          serverSeedHash: pending.fairness.serverSeedHash,
          balance: credit.balance,
          newBalance: credit.balance,
          walletType: pending.walletType,
        },
      };
    } catch (error) {
      console.error("Plinko settle error:", error);
      return { error: "An error occurred while settling the drop" };
    }
  },
};

export default service;
