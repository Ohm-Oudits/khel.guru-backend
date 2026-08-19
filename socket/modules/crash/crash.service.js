import User from "../../../models/user.model.js";
import Game from "../../../models/game.model.js";
import {
  debitGameStake,
  creditGameWin,
  getGameBalance,
} from "../../../services/casinoWallet.service.js";

// One active bet per user for the current crash round. The entry is created
// when the stake is debited and removed exactly once at settlement (cashout
// or bust), which is what guarantees a single debit and a single credit.
const activeBets = new Map();

const service = {
  async join(userId) {
    try {
      const game = await Game.findOne({ name: "crash" });
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

  // Debit the stake exactly once when the player commits to the round.
  async placeBet(userId, betAmount, walletType = "demo") {
    if (activeBets.has(userId)) {
      return { error: "You already have a bet in this round" };
    }

    const debit = await debitGameStake(userId, {
      gameKey: "crash",
      amount: betAmount,
      walletType,
    });
    if (debit.error) {
      return { error: debit.error };
    }

    activeBets.set(userId, { betAmount: debit.stake, walletType });
    return { success: true, betAmount: debit.stake, newBalance: debit.balance, walletType };
  },

  // Credit the total payout (stake x multiplier) exactly once. Popping the
  // bet from the map before the credit means a concurrent second cashout
  // finds no bet and is rejected.
  async cashOut(userId, multiplier) {
    const bet = activeBets.get(userId);
    if (!bet) {
      return { error: "No active bet to cash out" };
    }

    const cashoutMultiplier = Number(multiplier);
    if (!Number.isFinite(cashoutMultiplier) || cashoutMultiplier < 1) {
      return { error: "Invalid cashout multiplier" };
    }

    activeBets.delete(userId);

    const payout = bet.betAmount * cashoutMultiplier;
    const credit = await creditGameWin(userId, {
      gameKey: "crash",
      amount: payout,
      walletType: bet.walletType,
    });

    return {
      success: true,
      multiplier: cashoutMultiplier,
      payout,
      newBalance: credit.balance,
      walletType: bet.walletType,
    };
  },

  // A bust simply discards the bet: the stake debit stands, nothing is
  // credited. Safe to call without a bet (spectators / already settled).
  async bust(userId) {
    const bet = activeBets.get(userId);
    if (!bet) {
      return { success: true, hadBet: false };
    }

    activeBets.delete(userId);
    const newBalance = await getGameBalance(userId, bet.walletType);
    return { success: true, hadBet: true, newBalance, walletType: bet.walletType };
  },

  // Drop any unsettled bet when the player disconnects mid-round (treated
  // as a bust: the stake debit stands).
  clearBet(userId) {
    activeBets.delete(userId);
  },
};

export default service;
