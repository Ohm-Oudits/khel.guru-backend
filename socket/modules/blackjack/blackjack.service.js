import User from "../../../models/user.model.js";
import Game from "../../../models/game.model.js";
import BlackjackGame from "../../../models/games/blackjack.model.js";
import {
  debitGameStake,
  creditGameWin,
  refundGameStake,
  resolveGameWalletType,
} from "../../../services/casinoWallet.service.js";
import { consumeGameFloats } from "../../../services/fairnessConsume.service.js";
import {
  HILO_BLACKJACK_EVENT_COUNT,
  blackjackDealtFromState,
  buildCardFairnessPayload,
  cardsFromFloats,
  toBlackjackCard,
} from "../../../services/cardFairness.js";
import {
  BLACKJACK_PAYOUT_FORMULAS,
  compareHands,
  dealerShowsAce,
  isNaturalBlackjack,
  settleInsurance,
  settleMainHand,
} from "./blackjack.payout.js";

const getCardValue = (value) => {
  if (value === "A") return 11;
  if (["J", "Q", "K"].includes(value)) return 10;
  return parseInt(value, 10);
};

const calculateHandValue = (cards) => {
  let value = 0;
  let aces = 0;

  for (const card of cards) {
    if (!card || card.hidden || card.value === "hidden") continue;
    if (card.value === "A") {
      aces += 1;
      value += 11;
    } else {
      value += getCardValue(card.value);
    }
  }

  while (value > 21 && aces > 0) {
    value -= 10;
    aces -= 1;
  }

  return value;
};

const dealCard = (game, extra = {}) => {
  const raw = game.shoe[game.dealIndex];
  if (!raw) {
    throw new Error("Card shoe exhausted");
  }
  const card = { ...toBlackjackCard(raw, game.dealIndex), ...extra };
  game.dealIndex += 1;
  return card;
};

const revealDealerHole = (game) => {
  if (game.dealerCards?.[1]) {
    game.dealerCards[1].flipped = true;
    game.dealerCards[1].hidden = false;
  }
  game.dealerValue = calculateHandValue(game.dealerCards);
};

const holeShouldStayHidden = (game) =>
  ["playing", "insurance"].includes(game.gameState);

const buildSettlementSummary = (game) => {
  if (game.gameState !== "complete") return null;
  if (game.isSplit) {
    const hands = (game.splitResults || []).map((result, index) => {
      const settled = settleMainHand({
        stake: game.splitBets[index] || 0,
        result,
        splitHand: true,
      });
      return { hand: index, ...settled, stake: game.splitBets[index] || 0 };
    });
    const totalReturn = hands.reduce((sum, hand) => sum + hand.totalReturn, 0);
    const totalStake = hands.reduce((sum, hand) => sum + hand.stake, 0);
    return {
      kind: "split",
      hands,
      totalReturn,
      multiplier: totalStake > 0 ? totalReturn / totalStake : 0,
      insurance: game.insuranceResult
        ? {
            result: game.insuranceResult,
            stake: game.insuranceStake || 0,
            totalReturn: game.insuranceReturn || 0,
          }
        : null,
    };
  }

  const main = settleMainHand({
    stake: game.bet,
    result: game.result,
    playerNatural: isNaturalBlackjack(game.userCards) && !game.doubled,
  });
  return {
    kind: main.result,
    ...main,
    stake: game.bet,
    insurance: game.insuranceResult
      ? {
          result: game.insuranceResult,
          stake: game.insuranceStake || 0,
          totalReturn: game.insuranceReturn || 0,
        }
      : null,
  };
};

const sanitizeBlackjack = (game) => {
  if (!game) return game;
  const obj = game.toObject ? game.toObject() : { ...game };
  delete obj.shoe;
  delete obj.deck;
  const hideHole = holeShouldStayHidden(obj);
  if (hideHole && Array.isArray(obj.dealerCards) && obj.dealerCards.length >= 2) {
    const upCard = obj.dealerCards[0];
    obj.dealerCards = [
      upCard,
      {
        id: "dealer-hole",
        suit: "hidden",
        value: "hidden",
        flipped: false,
        hidden: true,
      },
    ];
    obj.dealerValue = calculateHandValue([upCard]);
  }
  obj.fairness =
    obj.nonce != null
      ? buildCardFairnessPayload({
          gameKey: "blackjack",
          nonce: obj.nonce,
          clientSeed: obj.clientSeed,
          serverSeedHash: obj.serverSeedHash,
          dealIndex: obj.dealIndex,
          dealt: blackjackDealtFromState(obj),
        })
      : null;
  obj.payoutTable = BLACKJACK_PAYOUT_FORMULAS;
  obj.settlement = buildSettlementSummary(obj);
  return obj;
};

const service = {
  async join(userId) {
    try {
      const activeGame = await BlackjackGame.findOne({
        userId,
        gameState: { $in: ["betting", "playing", "insurance", "dealer"] },
      });

      if (activeGame) {
        return {
          success: true,
          gameState: sanitizeBlackjack(activeGame),
        };
      }

      await BlackjackGame.deleteMany({
        userId,
        gameState: "complete",
      });

      const game = await Game.findOne({ name: "blackjack" });
      if (!game) {
        throw new Error("Game not found");
      }

      const user = await User.findById(userId);
      if (!user) {
        throw new Error("User not found");
      }

      const newGame = new BlackjackGame({
        userId,
        deck: [],
        shoe: [],
        dealIndex: 0,
        gameState: "betting",
        userCards: [],
        dealerCards: [],
        userValue: 0,
        dealerValue: 0,
        bet: 0,
        isSplit: false,
        splitHands: [[], []],
        splitValues: [0, 0],
        splitBets: [0, 0],
        splitResults: [null, null],
        activeHand: 0,
        doubled: false,
        insuranceOffered: false,
        insuranceTaken: false,
        insuranceStake: 0,
        insuranceResult: null,
        insuranceReturn: 0,
      });

      await newGame.save();

      try {
        const gameIndex = user.continuedGames.findIndex(
          (gameId) => gameId.toString() === game._id.toString()
        );
        if (gameIndex !== -1) {
          user.continuedGames.splice(gameIndex, 1);
        }
        user.continuedGames.unshift(game._id);
        game.gamesPlayed = (game.gamesPlayed || 0) + 1;

        await Promise.all([user.save(), game.save()]);
      } catch (error) {
        console.error("Error updating user/game stats:", error);
      }

      const createdGame = await BlackjackGame.findById(newGame._id);

      return {
        success: true,
        gameState: sanitizeBlackjack(createdGame),
      };
    } catch (error) {
      console.error("Join game error:", error);
      throw new Error(
        error.message || "An error occurred while joining the game"
      );
    }
  },

  async placeBet(userId, betAmount, walletType = "demo") {
    try {
      let game = await BlackjackGame.findOne({
        userId,
        gameState: { $in: ["betting", "playing", "insurance", "dealer"] },
      });

      if (!game) {
        await this.join(userId);
        game = await BlackjackGame.findOne({
          userId,
          gameState: "betting",
        });
      }

      if (!game) {
        throw new Error("No active game found");
      }

      if (game.gameState !== "betting") {
        return {
          success: true,
          gameState: sanitizeBlackjack(game),
        };
      }

      const resolvedWalletType = resolveGameWalletType(walletType);

      const claimed = await BlackjackGame.findOneAndUpdate(
        { _id: game._id, gameState: "betting" },
        {
          $set: {
            gameState: "playing",
            bet: betAmount,
            walletType: resolvedWalletType,
            settled: false,
            doubled: false,
            result: null,
            insuranceOffered: false,
            insuranceTaken: false,
            insuranceStake: 0,
            insuranceResult: null,
            insuranceReturn: 0,
          },
        },
        { new: true }
      );
      if (!claimed) {
        const current = await BlackjackGame.findById(game._id);
        return { success: true, gameState: sanitizeBlackjack(current) };
      }
      game = claimed;

      const debit = await debitGameStake(userId, {
        gameKey: "blackjack",
        amount: betAmount,
        walletType: resolvedWalletType,
      });
      if (debit.error) {
        await BlackjackGame.findByIdAndUpdate(game._id, {
          $set: { gameState: "betting", bet: 0 },
        });
        throw new Error(debit.error);
      }

      const fairness = await consumeGameFloats({
        userId,
        gameKey: "blackjack",
        count: HILO_BLACKJACK_EVENT_COUNT,
      });
      game.shoe = cardsFromFloats(fairness.floats);
      game.markModified("shoe");
      game.dealIndex = 0;
      game.nonce = fairness.nonce;
      game.clientSeed = fairness.clientSeed;
      game.serverSeedHash = fairness.serverSeedHash;

      const playerCard1 = dealCard(game);
      const playerCard2 = dealCard(game);
      game.userCards = [playerCard1, playerCard2];
      game.userValue = calculateHandValue(game.userCards);

      const dealerCard1 = dealCard(game);
      const dealerCard2 = dealCard(game, { flipped: false, hidden: true });
      game.dealerCards = [dealerCard1, dealerCard2];
      game.dealerValue = calculateHandValue([dealerCard1]);

      const playerNatural = isNaturalBlackjack(game.userCards);
      const dealerNatural = isNaturalBlackjack(game.dealerCards);

      if (dealerShowsAce(game.dealerCards) && !playerNatural) {
        game.gameState = "insurance";
        game.insuranceOffered = true;
        await game.save();
        return {
          success: true,
          gameState: sanitizeBlackjack(game),
          newBalance: debit.balance,
          walletType: resolvedWalletType,
        };
      }

      if (playerNatural || dealerNatural) {
        return await this.resolveNaturals(userId, game, {
          playerNatural,
          dealerNatural,
          newBalance: debit.balance,
        });
      }

      await game.save();

      return {
        success: true,
        gameState: sanitizeBlackjack(game),
        newBalance: debit.balance,
        walletType: resolvedWalletType,
      };
    } catch (error) {
      console.error("Place bet error:", error);
      throw new Error(error.message || "An error occurred while placing bet");
    }
  },

  async resolveNaturals(userId, game, { playerNatural, dealerNatural, newBalance }) {
    revealDealerHole(game);
    if (playerNatural && dealerNatural) {
      game.result = "draw";
    } else if (playerNatural) {
      game.result = "blackjack";
    } else {
      game.result = "lose";
    }
    game.gameState = "complete";
    await game.save();
    const settlement = await this.settleGameMoney(userId, game);
    return {
      success: true,
      gameState: sanitizeBlackjack(game),
      winnings: settlement.winnings,
      newBalance: settlement.newBalance ?? newBalance,
    };
  },

  async takeInsurance(userId, take) {
    const game = await BlackjackGame.findOne({
      userId,
      gameState: "insurance",
    });
    if (!game) {
      throw new Error("Insurance is not available");
    }

    if (take) {
      const insuranceStake = Number((game.bet / 2).toFixed(8));
      const debit = await debitGameStake(userId, {
        gameKey: "blackjack",
        amount: insuranceStake,
        walletType: game.walletType || "demo",
      });
      if (debit.error) {
        throw new Error(debit.error);
      }
      game.insuranceTaken = true;
      game.insuranceStake = insuranceStake;
    } else {
      game.insuranceTaken = false;
      game.insuranceStake = 0;
    }

    const dealerNatural = isNaturalBlackjack(game.dealerCards);
    const playerNatural = isNaturalBlackjack(game.userCards);
    const insurance = settleInsurance({
      insuranceStake: game.insuranceStake,
      dealerNatural,
    });
    game.insuranceResult = insurance.result;
    game.insuranceReturn = insurance.totalReturn;

    if (dealerNatural) {
      revealDealerHole(game);
      game.result = playerNatural ? "draw" : "lose";
      game.gameState = "complete";
      await game.save();
      const settlement = await this.settleGameMoney(userId, game);
      return {
        success: true,
        gameState: sanitizeBlackjack(game),
        winnings: settlement.winnings,
        newBalance: settlement.newBalance,
      };
    }

    game.gameState = "playing";
    await game.save();
    return {
      success: true,
      gameState: sanitizeBlackjack(game),
    };
  },

  async settleGameMoney(userId, game) {
    const claim = await BlackjackGame.findOneAndUpdate(
      { _id: game._id, settled: { $ne: true } },
      { $set: { settled: true } }
    );
    if (!claim) {
      return { winnings: 0, newBalance: null, alreadySettled: true };
    }

    const walletType = game.walletType || "demo";
    let winTotal = 0;
    let refundTotal = 0;

    const applyHand = (stake, result, extra = {}) => {
      const settled = settleMainHand({ stake, result, ...extra });
      if (settled.totalReturn <= 0) return;
      if (settled.result === "draw") {
        refundTotal += settled.totalReturn;
      } else {
        winTotal += settled.totalReturn;
      }
    };

    if (game.isSplit) {
      game.splitResults.forEach((result, index) => {
        const stake = game.splitBets[index] || 0;
        if (!result) {
          refundTotal += stake;
          return;
        }
        applyHand(stake, result, { splitHand: true });
      });
    } else {
      applyHand(game.bet, game.result, {
        playerNatural: isNaturalBlackjack(game.userCards) && !game.doubled,
      });
    }

    if ((game.insuranceReturn || 0) > 0) {
      winTotal += game.insuranceReturn;
    }

    const credit = await creditGameWin(userId, {
      gameKey: "blackjack",
      amount: winTotal,
      walletType,
    });
    let newBalance = credit.balance;
    if (refundTotal > 0) {
      const refund = await refundGameStake(userId, {
        gameKey: "blackjack",
        amount: refundTotal,
        walletType,
      });
      newBalance = refund.balance ?? newBalance;
    }

    return { winnings: winTotal + refundTotal, newBalance };
  },

  async playDealerAndSettle(userId, game) {
    game.gameState = "dealer";
    revealDealerHole(game);

    while (game.dealerValue < 17 && game.dealIndex < (game.shoe?.length || 0)) {
      const newCard = dealCard(game);
      game.dealerCards.push(newCard);
      game.dealerValue = calculateHandValue(game.dealerCards);
    }

    if (game.isSplit) {
      game.splitResults = game.splitValues.map((value) => {
        if (value > 21) return "lose";
        return compareHands(value, game.dealerValue);
      });
    } else if (game.userValue > 21) {
      game.result = "lose";
    } else {
      const outcome = compareHands(game.userValue, game.dealerValue);
      if (
        outcome === "win" &&
        isNaturalBlackjack(game.userCards) &&
        !game.doubled
      ) {
        game.result = "blackjack";
      } else {
        game.result = outcome;
      }
    }

    game.gameState = "complete";
    await game.save();
    const settlement = await this.settleGameMoney(userId, game);
    return {
      success: true,
      gameState: sanitizeBlackjack(game),
      winnings: settlement.winnings,
      newBalance: settlement.newBalance,
    };
  },

  async hit(userId) {
    try {
      const game = await BlackjackGame.findOne({
        userId,
        gameState: "playing",
      });
      if (!game) {
        throw new Error("No active game found");
      }

      const newCard = dealCard(game);
      if (game.isSplit) {
        game.splitHands[game.activeHand].push(newCard);
        game.splitValues[game.activeHand] = calculateHandValue(
          game.splitHands[game.activeHand]
        );
      } else {
        game.userCards.push(newCard);
        game.userValue = calculateHandValue(game.userCards);
      }

      const currentValue = game.isSplit
        ? game.splitValues[game.activeHand]
        : game.userValue;

      if (currentValue > 21) {
        if (game.isSplit) {
          game.splitResults[game.activeHand] = "lose";
          if (game.activeHand === 0) {
            game.activeHand = 1;
            await game.save();
            return {
              success: true,
              gameState: sanitizeBlackjack(game),
            };
          }
          const otherAlive = game.splitValues[0] <= 21;
          if (!otherAlive) {
            game.gameState = "complete";
            await game.save();
            const settlement = await this.settleGameMoney(userId, game);
            return {
              success: true,
              gameState: sanitizeBlackjack(game),
              winnings: settlement.winnings,
              newBalance: settlement.newBalance,
            };
          }
          return await this.playDealerAndSettle(userId, game);
        }

        game.gameState = "complete";
        game.result = "lose";
        revealDealerHole(game);
        await game.save();
        const settlement = await this.settleGameMoney(userId, game);
        return {
          success: true,
          gameState: sanitizeBlackjack(game),
          winnings: settlement.winnings,
          newBalance: settlement.newBalance,
        };
      }

      await game.save();
      return {
        success: true,
        gameState: sanitizeBlackjack(game),
      };
    } catch (error) {
      throw new Error(error.message || "An error occurred while hitting");
    }
  },

  async stand(userId) {
    try {
      const game = await BlackjackGame.findOne({
        userId,
        gameState: "playing",
      });
      if (!game) {
        throw new Error("No active game found");
      }

      if (game.isSplit && game.activeHand === 0) {
        game.activeHand = 1;
        await game.save();
        return {
          success: true,
          gameState: sanitizeBlackjack(game),
        };
      }

      return await this.playDealerAndSettle(userId, game);
    } catch (error) {
      console.error("Stand error:", error);
      throw new Error(error.message || "An error occurred while standing");
    }
  },

  async split(userId) {
    try {
      const game = await BlackjackGame.findOne({
        userId,
        gameState: "playing",
      });
      if (!game) {
        throw new Error("No active game found");
      }

      if (
        game.userCards.length !== 2 ||
        game.userCards[0].value !== game.userCards[1].value
      ) {
        throw new Error("Cannot split: cards must be a pair");
      }

      const claimed = await BlackjackGame.findOneAndUpdate(
        { _id: game._id, gameState: "playing", isSplit: false },
        { $set: { isSplit: true } }
      );
      if (!claimed) {
        throw new Error("Cannot split: hand already split");
      }

      const debit = await debitGameStake(userId, {
        gameKey: "blackjack",
        amount: game.bet,
        walletType: game.walletType || "demo",
      });
      if (debit.error) {
        await BlackjackGame.findByIdAndUpdate(game._id, {
          $set: { isSplit: false },
        });
        throw new Error("Insufficient balance for split");
      }

      game.isSplit = true;
      game.splitHands = [[game.userCards[0]], [game.userCards[1]]];
      game.splitValues = [
        calculateHandValue([game.userCards[0]]),
        calculateHandValue([game.userCards[1]]),
      ];
      game.splitBets = [game.bet, game.bet];
      game.splitResults = [null, null];
      game.activeHand = 0;

      const card1 = dealCard(game);
      const card2 = dealCard(game);
      game.splitHands[0].push(card1);
      game.splitHands[1].push(card2);
      game.splitValues[0] = calculateHandValue(game.splitHands[0]);
      game.splitValues[1] = calculateHandValue(game.splitHands[1]);

      await game.save();
      return {
        success: true,
        gameState: sanitizeBlackjack(game),
        newBalance: debit.balance,
      };
    } catch (error) {
      throw new Error(error.message || "An error occurred while splitting");
    }
  },

  async double(userId) {
    try {
      const game = await BlackjackGame.findOne({
        userId,
        gameState: "playing",
      });
      if (!game) {
        throw new Error("No active game found");
      }

      if (game.isSplit || game.userCards.length !== 2) {
        throw new Error(
          "Cannot double: must have exactly 2 cards and not be split"
        );
      }

      const debit = await debitGameStake(userId, {
        gameKey: "blackjack",
        amount: game.bet,
        walletType: game.walletType || "demo",
      });
      if (debit.error) {
        throw new Error("Insufficient balance for double");
      }

      game.bet *= 2;
      game.doubled = true;

      const newCard = dealCard(game);
      game.userCards.push(newCard);
      game.userValue = calculateHandValue(game.userCards);

      await game.save();

      if (game.userValue <= 21) {
        return await this.playDealerAndSettle(userId, game);
      }

      game.gameState = "complete";
      game.result = "lose";
      revealDealerHole(game);
      await game.save();
      const settlement = await this.settleGameMoney(userId, game);
      return {
        success: true,
        gameState: sanitizeBlackjack(game),
        winnings: settlement.winnings,
        newBalance: settlement.newBalance,
      };
    } catch (error) {
      throw new Error(error.message || "An error occurred while doubling");
    }
  },

  async getGameState(userId) {
    try {
      const game = await BlackjackGame.findOne({
        userId,
      });

      if (!game) {
        await BlackjackGame.deleteMany({
          userId,
          gameState: "complete",
        });
        throw new Error("No active game found");
      }

      return {
        success: true,
        gameState: sanitizeBlackjack(game),
      };
    } catch (error) {
      console.error("Get game state error:", error);
      throw new Error(
        error.message || "An error occurred while getting game state"
      );
    }
  },
};

export default service;
