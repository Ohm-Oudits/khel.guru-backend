import { io } from "../../socket.js";
import service from "./scratch.service.js";
import jwt from "jsonwebtoken";

const setupScratchSocket = () => {
  const scratchNamespace = io.of("/scratch");

  scratchNamespace.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    console.log("🔑 Authentication attempt for scratch game");

    if (!token) {
      console.log("❌ Token not provided for scratch game");
      return next(new Error("Authentication required"));
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      if (!decoded?.id) {
        console.log("❌ Decoded token missing 'id' for scratch game");
        return next(new Error("Invalid token"));
      }

      socket.data.userId = decoded.id;
      console.log(`✅ User ${decoded.id} authenticated for scratch game`);
      next();
    } catch (err) {
      console.error(
        "❌ Token verification failed for scratch game:",
        err.message
      );
      return next(new Error("Invalid token"));
    }
  });

  scratchNamespace.on("connection", (socket) => {
    const userId = socket.data.userId;
    console.log(`🎮 User ${userId} connected to scratch game`);

    socket.join(`scratch:${userId}`);

    // Get active game if exists
    socket.on("get_active_game", async () => {
      console.log(`🎲 User ${userId} requesting active game`);
      try {
        const activeGame = await service.getActiveGame(userId);
        console.log(
          `📊 Active game status for user ${userId}:`,
          activeGame ? "Found" : "Not found"
        );
        socket.emit("active_game", { game: activeGame });
      } catch (err) {
        console.error(
          `❌ Error getting active game for user ${userId}:`,
          err.message
        );
        socket.emit("error", { message: err.message });
      }
    });

    // Start new game
    socket.on("start_game", async (data) => {
      console.log(`🎮 User ${userId} starting new game:`, {
        betAmount: data.betAmount,
        isAutoBet: data.isAutoBet,
        numberOfBets: data.numberOfBets,
      });

      try {
        const { betAmount, isAutoBet, numberOfBets, walletType } = data;

        // Check if there's an active game
        const activeGame = await service.getActiveGame(userId);
        if (activeGame) {
          console.log(
            `⚠️ User ${userId} has an active game, cannot start new game`
          );
          socket.emit("error", { message: "You have an active game" });
          return;
        }

        const game = await service.createGame(
          userId,
          betAmount,
          isAutoBet,
          numberOfBets,
          walletType
        );
        console.log(`✅ New game created for user ${userId}:`, {
          gameId: game._id,
          betAmount: game.betAmount,
          isAutoBet: game.isAutoBet,
        });
        socket.emit("game_started", { game });

        // If auto bet, reveal all boxes immediately
        if (isAutoBet) {
          console.log(
            `🤖 Auto-bet mode: Revealing all boxes for game ${game._id}`
          );
          for (let i = 0; i < 9; i++) {
            await service.revealBox(game._id, i);
          }
          const result = await service.completeGame(game._id);
          console.log(`🎯 Auto-bet game ${game._id} completed:`, {
            winAmount: result.completedGame.winAmount,
            multiplier: result.completedGame.multiplier,
          });
          socket.emit("game_completed", result);
        }
      } catch (err) {
        console.error(
          `❌ Error starting game for user ${userId}:`,
          err.message
        );
        socket.emit("error", { message: err.message });
      }
    });

    // Reveal box
    socket.on("reveal_box", async (data) => {
      console.log(`🎯 User ${userId} revealing box:`, {
        gameId: data.gameId,
        boxIndex: data.boxIndex,
      });

      try {
        const { gameId, boxIndex } = data;
        const game = await service.revealBox(gameId, boxIndex);
        console.log(`✅ Box revealed in game ${gameId}:`, {
          boxIndex,
          diamondColor: game.grid[boxIndex].diamondColor,
        });
        socket.emit("box_revealed", { game });

        // Check if all boxes are revealed
        const allRevealed = game.grid.every((box) => box.revealed);
        if (allRevealed) {
          console.log(
            `🎮 All boxes revealed in game ${gameId}, completing game`
          );
          const result = await service.completeGame(gameId);
          console.log(`🎯 Game ${gameId} completed:`, {
            winAmount: result.completedGame.winAmount,
            multiplier: result.completedGame.multiplier,
          });
          socket.emit("game_completed", result);
        }
      } catch (err) {
        console.error(
          `❌ Error revealing box for user ${userId}:`,
          err.message
        );
        socket.emit("error", { message: err.message });
      }
    });

    // Join game (for tracking)
    socket.on("add_game", async () => {
      console.log(`👥 User ${userId} joining game tracking`);
      try {
        await service.join(userId);
        console.log(`✅ User ${userId} joined game tracking successfully`);
      } catch (err) {
        console.error(
          `❌ Error joining game tracking for user ${userId}:`,
          err.message
        );
        socket.emit("error", { message: err.message });
      }
    });

    socket.on("disconnect", () => {
      console.log(`👋 User ${userId} disconnected from scratch game`);
    });
  });
};

export default setupScratchSocket;
