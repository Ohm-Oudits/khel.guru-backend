import User from "../../../models/user.model.js";
import Game from "../../../models/game.model.js";
import BlackjackGame from "../../../models/games/blackjack.model.js";

const CARD_SUITS = ["♦", "♥", "♠", "♣"];
const CARD_VALUES = [
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "J",
  "Q",
  "K",
  "A",
];

const getCardValue = (value) => {
  if (value === "A") return 11;
  if (["J", "Q", "K"].includes(value)) return 10;
  return parseInt(value);
};

const createDeck = () => {
  let deck = [];
  for (let suit of CARD_SUITS) {
    for (let value of CARD_VALUES) {
      deck.push({
        suit,
        value,
        id: `${suit}-${value}`,
        flipped: true,
      });
    }
  }
  // Shuffle deck
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
};

const calculateHandValue = (cards) => {
  let value = 0;
  let aces = 0;

  for (let card of cards) {
    if (card.value === "A") {
      aces += 1;
      value += 11;
    } else {
      value += getCardValue(card.value);
    }
  }

  // Adjust for aces
  while (value > 21 && aces > 0) {
    value -= 10;
    aces -= 1;
  }

  return value;
};

const service = {
  async join(userId) {
    try {
      // First, check if user has an active game
      let activeGame = await BlackjackGame.findOne({
        userId,
        gameState: { $in: ["betting", "playing", "dealer"] },
      });

      // If there's an active game, return it with full state
      if (activeGame) {
        // Ensure we have the latest game state
        const updatedGame = await BlackjackGame.findById(activeGame._id);
        return {
          success: true,
          gameState: updatedGame,
        };
      }

      // Clean up any completed games for this user
      await BlackjackGame.deleteMany({
        userId,
        gameState: "complete",
      });

      // If no active game, create a new one
      const game = await Game.findOne({ name: "blackjack" });
      if (!game) {
        throw new Error("Game not found");
      }

      const user = await User.findById(userId);
      if (!user) {
        throw new Error("User not found");
      }

      // Create new game state
      const deck = createDeck();
      const newGame = new BlackjackGame({
        userId,
        deck,
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
      });

      await newGame.save();

      // Update user's continued games
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
        // Continue even if stats update fails
      }

      // Fetch the newly created game to ensure we have the complete state
      const createdGame = await BlackjackGame.findById(newGame._id);

      return {
        success: true,
        gameState: createdGame,
      };
    } catch (error) {
      console.error("Join game error:", error);
      throw new Error(
        error.message || "An error occurred while joining the game"
      );
    }
  },

  async placeBet(userId, betAmount) {
    try {
      // Find active game or create new one if none exists
      let game = await BlackjackGame.findOne({
        userId,
        gameState: { $in: ["betting", "playing", "dealer"] },
      });
      console.log(game);

      if (!game) {
        // Create new game if none exists
        const result = await this.join(userId);
        game = result.gameState;
      }

      // If game is in playing or dealer state, return current state
      if (game.gameState !== "betting") {
        return {
          success: true,
          gameState: game,
        };
      }

      const user = await User.findById(userId);
      if (!user || user.balance < betAmount) {
        throw new Error("Insufficient balance");
      }

      // Update user balance
      user.balance -= betAmount;
      await user.save();

      // Update game state
      game.bet = betAmount;
      game.gameState = "playing";

      // Deal initial cards
      const dealSequence = async () => {
        // Deal to player
        const playerCard1 = game.deck.pop();
        const playerCard2 = game.deck.pop();
        game.userCards = [playerCard1, playerCard2];
        game.userValue = calculateHandValue(game.userCards);

        // Deal to dealer
        const dealerCard1 = game.deck.pop();
        const dealerCard2 = game.deck.pop();
        dealerCard2.flipped = false; // Second dealer card is hidden
        game.dealerCards = [dealerCard1, dealerCard2];
        game.dealerValue = calculateHandValue([dealerCard1]); // Only count first card

        // Save the game state
        await game.save();
      };

      await dealSequence();

      // Fetch the updated game state to ensure we have the latest data
      const updatedGame = await BlackjackGame.findById(game._id);

      return {
        success: true,
        gameState: updatedGame,
      };
    } catch (error) {
      console.error("Place bet error:", error);
      throw new Error(error.message || "An error occurred while placing bet");
    }
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

      const newCard = game.deck.pop();
      if (game.isSplit) {
        // Handle split hand
        game.splitHands[game.activeHand].push(newCard);
        game.splitValues[game.activeHand] = calculateHandValue(
          game.splitHands[game.activeHand]
        );
      } else {
        // Handle regular hand
        game.userCards.push(newCard);
        game.userValue = calculateHandValue(game.userCards);
      }

      // Check for bust
      const currentValue = game.isSplit
        ? game.splitValues[game.activeHand]
        : game.userValue;
      if (currentValue > 21) {
        game.gameState = "complete";
        if (game.isSplit) {
          game.splitResults[game.activeHand] = "lose";
        } else {
          game.result = "lose";
        }
      }

      await game.save();
      return {
        success: true,
        gameState: game,
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
        // Move to second split hand
        game.activeHand = 1;
        await game.save();
        return {
          success: true,
          gameState: game,
        };
      }

      // Dealer's turn
      game.gameState = "dealer";
      game.dealerCards[1].flipped = true; // Reveal hidden card
      game.dealerValue = calculateHandValue(game.dealerCards);

      // Dealer hits on 16, stands on 17
      while (game.dealerValue < 17 && game.deck.length > 0) {
        const newCard = game.deck.pop();
        game.dealerCards.push(newCard);
        game.dealerValue = calculateHandValue(game.dealerCards);
      }

      // Determine winner
      if (game.isSplit) {
        game.splitResults = game.splitValues.map((value) => {
          if (value > 21) return "lose";
          if (game.dealerValue > 21) return "win";
          if (value > game.dealerValue) return "win";
          if (value < game.dealerValue) return "lose";
          return "draw";
        });
      } else {
        if (game.userValue > 21) {
          game.result = "lose";
        } else if (game.dealerValue > 21) {
          game.result = "win";
        } else if (game.userValue > game.dealerValue) {
          game.result = "win";
        } else if (game.userValue < game.dealerValue) {
          game.result = "lose";
        } else {
          game.result = "draw";
        }
      }

      game.gameState = "complete";
      await game.save();

      // Update user balance based on results
      const user = await User.findById(userId);
      let winnings = 0;

      if (game.isSplit) {
        game.splitResults.forEach((result, index) => {
          if (result === "win") {
            winnings += game.splitBets[index] * 2;
          } else if (result === "draw") {
            winnings += game.splitBets[index];
          }
        });
      } else {
        if (game.result === "win") {
          winnings = game.bet * 2;
        } else if (game.result === "draw") {
          winnings = game.bet;
        }
      }

      user.balance += winnings;
      await user.save();

      // Delete the completed game after a short delay
      setTimeout(async () => {
        try {
          await BlackjackGame.deleteOne({ _id: game._id });
        } catch (error) {
          console.error("Error deleting completed game:", error);
        }
      }, 5000); // Wait 5 seconds before deleting

      return {
        success: true,
        gameState: game,
        winnings,
      };
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

      const user = await User.findById(userId);
      if (!user || user.balance < game.bet) {
        throw new Error("Insufficient balance for split");
      }

      // Deduct additional bet
      user.balance -= game.bet;
      await user.save();

      // Create split hands
      game.isSplit = true;
      game.splitHands = [[game.userCards[0]], [game.userCards[1]]];
      game.splitValues = [
        calculateHandValue([game.userCards[0]]),
        calculateHandValue([game.userCards[1]]),
      ];
      game.splitBets = [game.bet, game.bet];
      game.splitResults = [null, null];
      game.activeHand = 0;

      // Deal one card to each split hand
      const card1 = game.deck.pop();
      const card2 = game.deck.pop();
      game.splitHands[0].push(card1);
      game.splitHands[1].push(card2);
      game.splitValues[0] = calculateHandValue(game.splitHands[0]);
      game.splitValues[1] = calculateHandValue(game.splitHands[1]);

      await game.save();
      return {
        success: true,
        gameState: game,
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

      const user = await User.findById(userId);
      if (!user || user.balance < game.bet) {
        throw new Error("Insufficient balance for double");
      }

      // Double the bet
      user.balance -= game.bet;
      game.bet *= 2;
      await user.save();

      // Deal one card
      const newCard = game.deck.pop();
      game.userCards.push(newCard);
      game.userValue = calculateHandValue(game.userCards);

      // Auto stand after double
      if (game.userValue <= 21) {
        return await this.stand(userId);
      } else {
        game.gameState = "complete";
        game.result = "lose";
        await game.save();
      }

      return {
        success: true,
        gameState: game,
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
        gameState: game,
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
