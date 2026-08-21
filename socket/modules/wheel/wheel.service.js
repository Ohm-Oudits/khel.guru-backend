import User from "../../../models/user.model.js";
import Game from "../../../models/game.model.js";
import Transaction from "../../../models/transaction.model.js";
import {
  debitGameStake,
  creditGameWin,
} from "../../../services/casinoWallet.service.js";
import { consumeGameFloats } from "../../../services/fairnessConsume.service.js";
import { deriveOutcomeIndex } from "../../../services/provablyFair.service.js";
import { getWheelList } from "./wheel.tables.js";

const generateResult = (risk, segments, float) => {
  const list = getWheelList(risk, segments);
  if (!list?.length) {
    return { multiplier: 0, index: 0, chance: 1 };
  }
  const index = deriveOutcomeIndex(float, list.length);
  const multiplier = parseFloat(list[index]);
  return {
    multiplier: Number.isFinite(multiplier) ? multiplier : 0,
    index,
    chance: 1 / list.length,
  };
};

const service = {
  async join(userId) {
    try {
      const game = await Game.findOne({ name: "wheel" });
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

  async playGame(userId, data) {
    try {
      const { risk, segments, betAmount, walletType = "demo" } = data;

      // Debit the stake from the wallet first; a losing bet keeps this debit.
      const debit = await debitGameStake(userId, {
        gameKey: "wheel",
        amount: betAmount,
        walletType,
      });
      if (debit.error) {
        return { error: debit.error };
      }

      const fairness = await consumeGameFloats({
        userId,
        gameKey: "wheel",
      });
      const result = generateResult(risk, segments, fairness.floats[0]);

      const winAmount = betAmount * result.multiplier;

      // Credit the total return (stake * multiplier) on a win; a loss credits nothing.
      const credit = await creditGameWin(userId, {
        gameKey: "wheel",
        amount: winAmount,
        walletType,
      });
      const newBalance = credit.balance ?? debit.balance;

      const betTransaction = new Transaction({
        userId: userId,
        amount: betAmount,
        type: "withdraw",
        game: "wheel",
        status: "success",
      });
      await betTransaction.save();

      if (winAmount > 0) {
        const winTransaction = new Transaction({
          userId: userId,
          amount: winAmount,
          type: "deposit",
          game: "wheel",
          status: "success",
        });
        await winTransaction.save();
      }

      return {
        success: true,
        result: {
          multiplier: result.multiplier,
          index: result.index,
          winAmount,
          chance: result.chance,
          balance: newBalance,
          newBalance,
          walletType,
          nonce: fairness.nonce,
          clientSeed: fairness.clientSeed,
          serverSeedHash: fairness.serverSeedHash,
        },
      };
    } catch (error) {
      console.log(error);
      return { error: "An error occurred while playing the game" };
    }
  },
};

export default service;
