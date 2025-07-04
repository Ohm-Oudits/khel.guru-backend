import User from "../../../models/user.model.js";
import Game from "../../../models/game.model.js";
import Transaction from "../../../models/transaction.model.js";

const generateResult = (risk, segments) => {
  const random = Math.random();

  if (risk === "Low") {
    if (random < 0.2) return { multiplier: 0, chance: 0.2 };
    if (random < 0.9) return { multiplier: 1.2, chance: 0.7 };
    return { multiplier: 1.5, chance: 0.1 };
  }

  if (risk === "Medium") {
    if (random < 0.5) return { multiplier: 0, chance: 0.5 };

    const remainingRandom = (random - 0.5) * 2;

    if (segments === 30) {
      if (remainingRandom < 0.4) return { multiplier: 1.5, chance: 0.2 };
      if (remainingRandom < 0.6) return { multiplier: 1.7, chance: 0.1 };
      if (remainingRandom < 0.8) return { multiplier: 2.0, chance: 0.1 };
      if (remainingRandom < 0.9) return { multiplier: 3.0, chance: 0.05 };
      return { multiplier: 4.0, chance: 0.05 };
    }

    if (segments === 50) {
      if (remainingRandom < 0.52) return { multiplier: 1.5, chance: 0.26 };
      if (remainingRandom < 0.84) return { multiplier: 1.7, chance: 0.16 };
      if (remainingRandom < 0.96) return { multiplier: 2.0, chance: 0.06 };
      return { multiplier: 3.0, chance: 0.02 };
    }

    if (remainingRandom < 0.6) return { multiplier: 1.5, chance: 0.3 };
    if (remainingRandom < 0.8) return { multiplier: 1.7, chance: 0.1 };
    return { multiplier: 2.0, chance: 0.1 };
  }

  if (risk === "High") {
    const winProbability = 1 / segments;
    const loseProbability = (segments - 1) / segments;

    if (random < loseProbability) {
      return { multiplier: 0, chance: loseProbability };
    }

    const multiplier = segments * 0.99;
    return { multiplier, chance: winProbability };
  }

  return { multiplier: 0, chance: 1 };
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
      const { risk, segments, betAmount } = data;
      const user = await User.findById(userId);

      if (!user) {
        return { error: "User not found" };
      }

      if (user.balance < betAmount) {
        return { error: "Insufficient balance" };
      }

      const result = generateResult(risk, segments);

      const winAmount = betAmount * result.multiplier;
      const finalBalance = user.balance - betAmount + winAmount;

      user.balance = finalBalance;
      await user.save();

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
          winAmount,
          chance: result.chance,
          balance: finalBalance,
        },
      };
    } catch (error) {
      console.log(error);
      return { error: "An error occurred while playing the game" };
    }
  },
};

export default service;
