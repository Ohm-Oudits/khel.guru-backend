import User from "../../../models/user.model.js";
import Game from "../../../models/game.model.js";
import {
  debitGameStake,
  creditGameWin,
} from "../../../services/casinoWallet.service.js";
import { consumeGameFloats } from "../../../services/fairnessConsume.service.js";
import {
  deriveRoulettePocket,
  ROULETTE_FAIRNESS_FORMULA,
} from "../../../services/provablyFair.service.js";
import { wheelIndexFromPocket } from "./roulette.constants.js";

export const ROULETTE_RED_NUMBERS = [
  1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36,
];

const STRAIGHT_PAYOUT = 35;
const DOZEN_PAYOUT = 2;
const EVEN_MONEY_PAYOUT = 1;

const getBetMultiplier = (betType) => {
  const key = String(betType);

  if (/^(?:0|[1-9]|[1-2][0-9]|3[0-6])$/.test(key)) {
    return STRAIGHT_PAYOUT;
  }

  if (["1-12", "13-24", "25-36", "row1", "row2", "row3"].includes(key)) {
    return DOZEN_PAYOUT;
  }

  if (
    ["even", "odd", "red", "black", "1-18", "19-36"].includes(key)
  ) {
    return EVEN_MONEY_PAYOUT;
  }

  return 0;
};

const service = {
  async join(userId) {
    try {
      let game = await Game.findOne({ name: "roulette" });
      if (!game) {
        game = await Game.create({
          name: "roulette",
          description: ["Place your bets and spin the wheel."],
          gamesPlayed: 0,
        });
      }

      const user = await User.findById(userId);
      if (!user) {
        return { error: "User not found" };
      }

      if (!Array.isArray(user.continuedGames)) {
        user.continuedGames = [];
      }

      const gameIndex = user.continuedGames.findIndex(
        (gameId) => gameId.toString() === game._id.toString()
      );

      if (gameIndex !== -1) {
        user.continuedGames.splice(gameIndex, 1);
      }
      user.continuedGames.unshift(game._id);
      game.gamesPlayed = (game.gamesPlayed || 0) + 1;

      await user.save();
      await game.save();
      return { success: true };
    } catch (error) {
      console.error("[Roulette Service] join error:", error.message);
      return { error: "An error occurred while joining the game" };
    }
  },

  async placeBet(userId, betData) {
    console.log(
      `[Roulette Service] Starting bet placement for user ${userId}`,
      {
        totalAmount: betData.totalAmount,
        numberOfBets: Object.keys(betData.bets).length,
      }
    );

    try {
      const { bets, totalAmount, walletType = "demo" } = betData;

      if (totalAmount < 0) {
        throw new Error("Invalid bet amount");
      }

      const debit = await debitGameStake(userId, {
        gameKey: "roulette",
        amount: totalAmount,
        walletType,
      });
      if (debit.error) {
        return { error: debit.error };
      }

      const fairness = await consumeGameFloats({
        userId,
        gameKey: "roulette",
      });
      // Stake PF: HMAC byte stream → float ∈ [0,1) → floor(float × 37) → pocket 0–36.
      const pocket = deriveRoulettePocket(fairness.floats[0]);
      const wheelIndex = wheelIndexFromPocket(pocket);
      console.log(
        `[Roulette Service] Generated result: pocket=${pocket} wheelIndex=${wheelIndex}`
      );

      let totalWin = 0;
      let totalLoss = totalAmount;
      const betResults = {};

      for (const [betType, amount] of Object.entries(bets)) {
        console.log(
          `[Roulette Service] Processing bet: ${betType} - ${amount}`
        );
        const winAmount = this.calculateWin(betType, amount, pocket);
        betResults[betType] = {
          amount,
          win: winAmount,
          result: winAmount > 0 ? "win" : "loss",
        };

        if (winAmount > 0) {
          totalWin += winAmount;
          totalLoss -= amount;
        }
      }

      const credit = await creditGameWin(userId, {
        gameKey: "roulette",
        amount: totalWin,
        walletType,
      });
      const newBalance = credit.balance ?? debit.balance;

      console.log(
        `[Roulette Service] Bet placement completed for user ${userId}:`,
        {
          pocket,
          totalWin,
          totalLoss,
          newBalance,
        }
      );

      return {
        success: true,
        result: pocket.toString(),
        betResults,
        totalWin,
        totalLoss,
        newBalance,
        walletType,
        provablyFair: {
          gameKey: "roulette",
          nonce: fairness.nonce,
          clientSeed: fairness.clientSeed,
          serverSeedHash: fairness.serverSeedHash,
          cursor: 0,
          formula: ROULETTE_FAIRNESS_FORMULA,
        },
        nonce: fairness.nonce,
        clientSeed: fairness.clientSeed,
        serverSeedHash: fairness.serverSeedHash,
      };
    } catch (error) {
      console.error(
        "[Roulette Service] Error in bet placement:",
        error.message
      );
      throw error;
    }
  },

  calculateWin(betType, amount, result) {
    const multiplier = getBetMultiplier(betType);
    const isWin = this.getBetResult(betType, result);
    return isWin ? amount * (multiplier + 1) : 0;
  },

  getBetResult(betType, result) {
    const key = String(betType);

    if (/^(?:0|[1-9]|[1-2][0-9]|3[0-6])$/.test(key)) {
      return parseInt(key, 10) === result;
    }

    switch (key) {
      case "1-12":
        return result >= 1 && result <= 12;
      case "13-24":
        return result >= 13 && result <= 24;
      case "25-36":
        return result >= 25 && result <= 36;
      case "row1":
        return result !== 0 && result % 3 === 0;
      case "row2":
        return result !== 0 && result % 3 === 2;
      case "row3":
        return result !== 0 && result % 3 === 1;
      case "even":
        return result !== 0 && result % 2 === 0;
      case "odd":
        return result !== 0 && result % 2 === 1;
      case "red":
        return ROULETTE_RED_NUMBERS.includes(result);
      case "black":
        return result !== 0 && !ROULETTE_RED_NUMBERS.includes(result);
      case "1-18":
        return result >= 1 && result <= 18;
      case "19-36":
        return result >= 19 && result <= 36;
      default:
        return false;
    }
  },
};

export default service;
