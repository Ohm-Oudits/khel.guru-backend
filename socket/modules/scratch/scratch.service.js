import User from "../../../models/user.model.js";
import Game from "../../../models/game.model.js";
import ScratchGame from "../../../models/games/scratch.model.js";
import {
  debitGameStake,
  creditGameWin,
  refundGameStake,
  resolveGameWalletType,
} from "../../../services/casinoWallet.service.js";

const balloonTypes = ["#F28B82", "#FBBC05", "#34A853", "#4285F4", "#9A67EA"];
const diamondTypes = ["red", "blue", "green", "yellow", "purple"];

const displaySlots = [
  { diamonds: 8, different: 0, free: 1, multiplier: 100.0 },
  { diamonds: 7, different: 0, free: 2, multiplier: 10.0 },
  { diamonds: 6, different: 0, free: 3, multiplier: 7.0 },
  { diamonds: 5, different: 4, free: 0, multiplier: 5.0 },
  { diamonds: 5, different: 3, free: 1, multiplier: 3.5 },
  { diamonds: 4, different: 4, free: 1, multiplier: 2.35 },
  { diamonds: 4, different: 3, free: 2, multiplier: 1.45 },
  { diamonds: 4, different: 2, free: 3, multiplier: 0.85 },
  { diamonds: 3, different: 3, free: 3, multiplier: 0.45 },
  { diamonds: 3, different: 2, free: 4, multiplier: 0.15 },
  { diamonds: 2, different: 2, free: 5, multiplier: 0.0 },
  { diamonds: 2, different: 0, free: 7, multiplier: 0.0 },
];

const GRID_CELLS = 9;

function countPatternFromGrid(grid) {
  const counts = {};
  for (const box of grid) {
    const color = box.diamondColor;
    counts[color] = (counts[color] || 0) + 1;
  }

  const ranked = Object.entries(counts)
    .map(([color, count]) => ({ color, count }))
    .sort((a, b) => b.count - a.count || a.color.localeCompare(b.color));

  const mainCount = ranked[0]?.count || 0;
  const secondCount = ranked[1]?.count || 0;
  const freeCount = GRID_CELLS - mainCount - secondCount;

  return {
    mainColor: ranked[0]?.color || null,
    secondColor: ranked[1]?.color || null,
    mainCount,
    secondCount,
    freeCount,
  };
}

function findMatchingPattern(mainCount, secondCount, freeCount) {
  return displaySlots.find(
    (slot) =>
      slot.diamonds === mainCount &&
      slot.different === secondCount &&
      slot.free === freeCount
  );
}

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

  async createGame(
    userId,
    betAmount,
    isAutoBet = false,
    numberOfBets = 0,
    walletType = "demo"
  ) {
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

      const resolvedWalletType = resolveGameWalletType(walletType);

      // Debit the stake from the wallet (atomic, balance-floor guarded).
      const debit = await debitGameStake(userId, {
        gameKey: "scratch",
        amount: betAmount,
        walletType: resolvedWalletType,
      });
      if (debit.error) {
        console.log(`⚠️ Stake debit rejected for user ${userId}:`, debit.error);
        throw new Error(debit.error);
      }
      console.log(`💰 Stake debited for user ${userId}:`, {
        newBalance: debit.balance,
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
        walletType: resolvedWalletType,
      });

      try {
        await scratchGame.save();
      } catch (saveError) {
        // The round never came into existence: give the stake back.
        await refundGameStake(userId, {
          gameKey: "scratch",
          amount: betAmount,
          walletType: resolvedWalletType,
        });
        throw saveError;
      }
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

      // Update grid — only the newly clicked box should animate client-side.
      game.grid.forEach((box, i) => {
        if (i !== boxIndex) {
          box.animating = false;
        }
      });
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

      // Grid is authoritative: all 9 cells are decided at game creation.
      const patternStats = countPatternFromGrid(game.grid);
      const {
        mainColor,
        secondColor,
        mainCount,
        secondCount,
        freeCount,
      } = patternStats;

      console.log(`📊 Game pattern:`, {
        mainColor,
        mainCount,
        secondColor,
        secondCount,
        freeCount,
      });

      const pattern = findMatchingPattern(mainCount, secondCount, freeCount);

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

      // Claim the round atomically: only the caller that deletes the round
      // document gets to credit the payout, so a double completion (e.g. two
      // racing complete events) can never pay twice.
      const claimed = await ScratchGame.findByIdAndDelete(gameId);
      if (!claimed) {
        console.error(`❌ Game ${gameId} already settled by another call`);
        throw new Error("Game not found or already completed");
      }
      console.log(`✅ Game ${gameId} completed and deleted`);

      const walletType = game.walletType || "demo";
      // Credit the total payout (a 0 winAmount is a no-op loss).
      const credit = await creditGameWin(game.userId, {
        gameKey: "scratch",
        amount: winAmount,
        walletType,
      });

      const gameResult = {
        completedGame: {
          ...game.toObject(),
          multiplier,
          winAmount,
          isCompleted: true,
          newBalance: credit.balance,
          walletType,
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
          game.remainingBets,
          walletType
        );
        gameResult.newGame = newGame;
      }

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
