import User from "../../../models/user.model.js";
import Game from "../../../models/game.model.js";
import {
  debitGameStake,
  creditGameWin,
} from "../../../services/casinoWallet.service.js";

const service = {
  async join(userId) {
    try {
      const game = await Game.findOne({ name: "roulette" });
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

  async placeBet(userId, betData) {
    console.log(
      `[Roulette Service] Starting bet placement for user ${userId}`,
      {
        totalAmount: betData.totalAmount,
        numberOfBets: Object.keys(betData.bets).length,
      }
    );

    try {
      console.log("[Roulette Service] Validating bet amount...");
      const { bets, totalAmount, walletType = "demo" } = betData;

      if (totalAmount <= 0) {
        throw new Error("Invalid bet amount");
      }

      // Debit the combined stake of every bet on the board once; losing
      // bets keep this debit.
      const debit = await debitGameStake(userId, {
        gameKey: "roulette",
        amount: totalAmount,
        walletType,
      });
      if (debit.error) {
        return { error: debit.error };
      }

      const result = Math.floor(Math.random() * 37);
      console.log(`[Roulette Service] Generated result: ${result}`);

      let totalWin = 0;
      let totalLoss = totalAmount;
      const betResults = {};

      for (const [betType, amount] of Object.entries(bets)) {
        console.log(
          `[Roulette Service] Processing bet: ${betType} - ${amount}`
        );
        const winAmount = this.calculateWin(betType, amount, result);
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

      // Credit the combined payout of the winning bets (stake + profit,
      // since calculateWin returns amount * (multiplier + 1)) once.
      const credit = await creditGameWin(userId, {
        gameKey: "roulette",
        amount: totalWin,
        walletType,
      });
      const newBalance = credit.balance ?? debit.balance;

      console.log(
        `[Roulette Service] Bet placement completed for user ${userId}:`,
        {
          result,
          totalWin,
          totalLoss,
          newBalance,
        }
      );

      return {
        success: true,
        result: result.toString(),
        betResults,
        totalWin,
        totalLoss,
        newBalance,
        walletType,
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
    console.log(
      `[Roulette Service] Calculating win for bet type: ${betType}, amount: ${amount}, result: ${result}`
    );

    const multipliers = {
      straight: 35, // Single number
      split: 17, // Two numbers
      street: 11, // Three numbers
      corner: 8, // Four numbers
      line: 5, // Six numbers
      dozen: 2, // 12 numbers
      column: 2, // 12 numbers
      red: 1, // Red numbers
      black: 1, // Black numbers
      even: 1, // Even numbers
      odd: 1, // Odd numbers
      high: 1, // 19-36
      low: 1, // 1-18
    };

    const getBetResult = (betType, result) => {
      console.log(
        `[Roulette Service] Checking bet result for type: ${betType}, number: ${result}`
      );

      const redNumbers = [
        1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36,
      ];

      switch (betType) {
        case "straight":
          return betType === result.toString();
        case "red":
          return redNumbers.includes(result);
        case "black":
          return !redNumbers.includes(result) && result !== 0;
        case "even":
          return result !== 0 && result % 2 === 0;
        case "odd":
          return result % 2 === 1;
        case "high":
          return result >= 19 && result <= 36;
        case "low":
          return result >= 1 && result <= 18;
        case "dozen1":
          return result >= 1 && result <= 12;
        case "dozen2":
          return result >= 13 && result <= 24;
        case "dozen3":
          return result >= 25 && result <= 36;
        case "column1":
          return result % 3 === 1;
        case "column2":
          return result % 3 === 2;
        case "column3":
          return result % 3 === 0 && result !== 0;
        default:
          console.warn(`[Roulette Service] Unknown bet type: ${betType}`);
          return false;
      }
    };

    const multiplier = multipliers[betType] || 0;
    const isWin = getBetResult(betType, result);

    console.log(
      `[Roulette Service] Bet result: ${
        isWin ? "WIN" : "LOSS"
      }, Multiplier: ${multiplier}`
    );
    return isWin ? amount * (multiplier + 1) : 0;
  },

  getBetResult(betType, result) {
    const redNumbers = [
      1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36,
    ];

    switch (betType) {
      case "0":
      case "1":
      case "2":
      case "3":
      case "4":
      case "5":
      case "6":
      case "7":
      case "8":
      case "9":
      case "10":
      case "11":
      case "12":
      case "13":
      case "14":
      case "15":
      case "16":
      case "17":
      case "18":
      case "19":
      case "20":
      case "21":
      case "22":
      case "23":
      case "24":
      case "25":
      case "26":
      case "27":
      case "28":
      case "29":
      case "30":
      case "31":
      case "32":
      case "33":
      case "34":
      case "35":
      case "36":
        return parseInt(betType) === result;

      case "1-12":
        return result >= 1 && result <= 12;
      case "13-24":
        return result >= 13 && result <= 24;
      case "25-36":
        return result >= 25 && result <= 36;

      case "row1":
        return result % 3 === 0;
      case "row2":
        return result % 3 === 2;
      case "row3":
        return result % 3 === 1;

      case "even":
        return result !== 0 && result % 2 === 0;
      case "odd":
        return result % 2 === 1;
      case "red":
        return redNumbers.includes(result);
      case "black":
        return result !== 0 && !redNumbers.includes(result);
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
