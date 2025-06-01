import User from "../../../models/user.model.js";
import Game from "../../../models/game.model.js";
import ScratchGame from "../../../models/games/scratch.model.js";

const balloonTypes = ["#F28B82", "#FBBC05", "#34A853", "#4285F4", "#9A67EA"];
const diamondTypes = ["red", "blue", "green", "yellow", "purple"];

const displaySlots = [
  { diamonds: 8, different: 0, free: 0, multiplier: 100.0 },
  { diamonds: 7, different: 0, free: 1, multiplier: 10.0 },
  { diamonds: 6, different: 0, free: 2, multiplier: 7.0 },
  { diamonds: 5, different: 3, free: 0, multiplier: 5.0 },
  { diamonds: 5, different: 0, free: 3, multiplier: 3.5 },
  { diamonds: 4, different: 4, free: 0, multiplier: 2.35 },
  { diamonds: 4, different: 3, free: 1, multiplier: 1.45 },
  { diamonds: 4, different: 0, free: 4, multiplier: 0.85 },
  { diamonds: 3, different: 3, free: 2, multiplier: 0.45 },
  { diamonds: 3, different: 2, free: 3, multiplier: 0.15 },
  { diamonds: 2, different: 2, free: 4, multiplier: 0.0 },
  { diamonds: 2, different: 0, free: 6, multiplier: 0.0 },
];

const service = {
  async getActiveGame(userId) {
    console.log(`🔍 Fetching active game for user ${userId}`);
    try {
      const activeGame = await ScratchGame.findOne({
        userId,
        isCompleted: false,
      }).sort({ createdAt: -1 });

      console.log(
        `📊 Active game status for user ${userId}:`,
        activeGame
          ? {
              gameId: activeGame._id,
              betAmount: activeGame.betAmount,
              isAutoBet: activeGame.isAutoBet,
              remainingBets: activeGame.remainingBets,
            }
          : "No active game found"
      );

      return activeGame;
    } catch (error) {
      console.error(
        `❌ Error fetching active game for user ${userId}:`,
        error.message
      );
      throw new Error("Error fetching active game");
    }
  },

  async createGame(userId, betAmount, isAutoBet = false, numberOfBets = 0) {
    console.log(`🎮 Creating new game for user ${userId}:`, {
      betAmount,
      isAutoBet,
      numberOfBets,
    });

    try {
      const game = await Game.findOne({ name: "scratch" });
      if (!game) {
        console.error(`❌ Game "scratch" not found in database`);
        throw new Error("Game not found");
      }

      const user = await User.findById(userId);
      if (!user) {
        console.error(`❌ User ${userId} not found`);
        throw new Error("User not found");
      }

      // Check if user has enough balance
      if (user.balance < betAmount) {
        console.log(`⚠️ Insufficient balance for user ${userId}:`, {
          currentBalance: user.balance,
          requiredAmount: betAmount,
        });
        throw new Error("Insufficient balance");
      }

      // Deduct bet amount from user balance
      user.balance -= betAmount;
      await user.save();
      console.log(`💰 Updated balance for user ${userId}:`, {
        newBalance: user.balance,
        deductedAmount: betAmount,
      });

      // Create grid with random colors
      const grid = Array.from({ length: 9 }, () => ({
        revealed: false,
        animating: false,
        balloonColor:
          balloonTypes[Math.floor(Math.random() * balloonTypes.length)],
        diamondColor:
          diamondTypes[Math.floor(Math.random() * diamondTypes.length)],
      }));

      const scratchGame = new ScratchGame({
        userId,
        gameId: game._id,
        betAmount,
        grid,
        isAutoBet,
        remainingBets: isAutoBet ? numberOfBets - 1 : 0,
      });

      await scratchGame.save();
      console.log(`✅ New game created successfully:`, {
        gameId: scratchGame._id,
        userId,
        betAmount,
        isAutoBet,
        remainingBets: scratchGame.remainingBets,
      });

      return scratchGame;
    } catch (error) {
      console.error(
        `❌ Error creating game for user ${userId}:`,
        error.message
      );
      throw new Error(error.message);
    }
  },

  async revealBox(gameId, boxIndex) {
    console.log(`🎯 Revealing box in game ${gameId}:`, { boxIndex });

    try {
      const game = await ScratchGame.findById(gameId);
      if (!game || game.isCompleted) {
        console.error(`❌ Game ${gameId} not found or already completed`);
        throw new Error("Game not found or completed");
      }

      if (game.grid[boxIndex].revealed) {
        console.log(`⚠️ Box ${boxIndex} already revealed in game ${gameId}`);
        throw new Error("Box already revealed");
      }

      // Update grid
      game.grid[boxIndex].revealed = true;
      game.grid[boxIndex].animating = true;

      // Update diamond counts
      const diamondColor = game.grid[boxIndex].diamondColor;
      const currentCounts = game.diamondCounts.get(diamondColor) || {
        count: 0,
        indices: [],
      };
      game.diamondCounts.set(diamondColor, {
        count: currentCounts.count + 1,
        indices: [...currentCounts.indices, boxIndex],
      });

      await game.save();
      console.log(`✅ Box revealed successfully:`, {
        gameId,
        boxIndex,
        diamondColor,
        newCount: game.diamondCounts.get(diamondColor).count,
      });

      return game;
    } catch (error) {
      console.error(`❌ Error revealing box in game ${gameId}:`, error.message);
      throw new Error(error.message);
    }
  },

  async completeGame(gameId) {
    console.log(`🎮 Completing game ${gameId}`);

    try {
      const game = await ScratchGame.findById(gameId);
      if (!game || game.isCompleted) {
        console.error(`❌ Game ${gameId} not found or already completed`);
        throw new Error("Game not found or already completed");
      }

      // Calculate multiplier based on diamond patterns
      const diamondCounts = Object.fromEntries(game.diamondCounts);
      const mainColor = Object.entries(diamondCounts).reduce((a, b) =>
        b[1].count > a[1].count ? b : a
      )[0];
      const secondColor = Object.entries(diamondCounts).reduce((a, b) =>
        b[0] !== mainColor && b[1].count > a[1].count ? b : a
      )[0];

      const mainCount = diamondCounts[mainColor].count;
      const secondCount = diamondCounts[secondColor].count;
      const freeCount = 9 - mainCount - secondCount;

      console.log(`📊 Game pattern:`, {
        mainColor,
        mainCount,
        secondColor,
        secondCount,
        freeCount,
      });

      // Find matching pattern
      const pattern = displaySlots.find(
        (slot) =>
          slot.diamonds === mainCount &&
          slot.different === secondCount &&
          slot.free === freeCount
      );

      const multiplier = pattern ? pattern.multiplier : 0;
      const winAmount = game.betAmount * multiplier;

      console.log(`💰 Game result:`, {
        pattern: pattern
          ? {
              diamonds: pattern.diamonds,
              different: pattern.different,
              free: pattern.free,
            }
          : "No matching pattern",
        multiplier,
        betAmount: game.betAmount,
        winAmount,
      });

      const gameResult = {
        completedGame: {
          ...game.toObject(),
          multiplier,
          winAmount,
          isCompleted: true,
        },
      };

      if (game.isAutoBet && game.remainingBets > 0) {
        console.log(`🤖 Auto-bet continuing:`, {
          remainingBets: game.remainingBets,
          userId: game.userId,
        });

        const newGame = await this.createGame(
          game.userId,
          game.betAmount,
          true,
          game.remainingBets
        );
        gameResult.newGame = newGame;
      }

      await ScratchGame.findByIdAndDelete(gameId);
      console.log(`✅ Game ${gameId} completed and deleted`);

      return gameResult;
    } catch (error) {
      console.error(`❌ Error completing game ${gameId}:`, error.message);
      throw new Error(error.message);
    }
  },

  async join(userId) {
    console.log(`👥 User ${userId} joining game tracking`);

    try {
      const game = await Game.findOne({ name: "scratch" });
      if (!game) {
        console.error(`❌ Game "scratch" not found in database`);
        throw new Error("Game not found");
      }

      const user = await User.findById(userId);
      if (!user) {
        console.error(`❌ User ${userId} not found`);
        throw new Error("User not found");
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

      console.log(`✅ User ${userId} joined game tracking successfully:`, {
        gamesPlayed: game.gamesPlayed,
        continuedGames: user.continuedGames.length,
      });

      return { success: true };
    } catch (error) {
      console.error(
        `❌ Error joining game tracking for user ${userId}:`,
        error.message
      );
      throw new Error("An error occurred while joining the game");
    }
  },
};

export default service;
