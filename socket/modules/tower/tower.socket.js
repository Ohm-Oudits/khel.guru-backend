import { io } from "../../socket.js";
import service from "./tower.service.js";
import jwt from "jsonwebtoken";

const setupTowerSocket = () => {
  const towerNamespace = io.of("/tower");

  towerNamespace.use((socket, next) => {
    const token = socket.handshake.auth?.token;

    if (!token) {
      console.log("Token not provided");
      return next(new Error("Authentication required"));
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      if (!decoded?.id) {
        console.log("Decoded token missing 'id'");
        return next(new Error("Invalid token"));
      }

      socket.data.userId = String(decoded.id);
      next();
    } catch (err) {
      console.error("Token verification failed:", err.message);
      return next(new Error("Invalid token"));
    }
  });

  towerNamespace.on("connection", (socket) => {
    const userId = socket.data.userId;
    console.log(`User ${userId} joined tower`);

    socket.join(`tower:${userId}`);

    socket.on("get_game_state", async () => {
      try {
        const gameState = await service.getGameState(userId);
        socket.emit("game_state", gameState);
      } catch (err) {
        socket.emit("error", { message: err.message });
      }
    });

    socket.on("add_game", async (data) => {
      try {
        const { betAmount, difficulty, walletType } = data || {};
        const gameState = await service.startGame(
          userId,
          betAmount,
          difficulty,
          walletType
        );

        if (gameState.existingGame) {
          socket.emit("game_state", gameState);
          return;
        }

        socket.emit("round_started", {
          betAmount: gameState.betAmount,
          difficulty: gameState.difficulty,
          currentRow: gameState.currentRow,
          cols: gameState.cols,
          rows: gameState.rows,
          grid: gameState.grid,
          newBalance: gameState.newBalance,
          walletType: gameState.walletType,
          fairness: gameState.fairness,
        });
        socket.emit("game_state", gameState);
      } catch (err) {
        socket.emit("error", { message: err.message });
      }
    });

    socket.on("reveal", async (data) => {
      try {
        const { index } = data || {};
        const result = await service.revealBox(userId, index);
        socket.emit("reveal", result);
        socket.emit("game_state", {
          ...(await service.getGameState(userId)),
          hasActiveGame: !result.gameOver && !result.gameWon,
          grid: result.grid,
          selectedBoxes: result.selectedBoxes,
          currentRow: result.currentRow,
          gameOver: result.gameOver,
          gameWon: result.gameWon,
          profit: result.profit,
          loss: result.loss,
          fairness: result.fairness,
        });
      } catch (err) {
        socket.emit("error", { message: err.message });
      }
    });

    socket.on("checkout", async () => {
      try {
        const result = await service.checkout(userId);
        socket.emit("checkout_result", result);
        socket.emit("game_state", {
          ...result,
          hasActiveGame: false,
          checkedOut: true,
        });
      } catch (err) {
        socket.emit("error", { message: err.message });
      }
    });

    socket.on("continue_game", async () => {
      try {
        const gameState = await service.continueGame(userId);
        socket.emit("game_state", {
          ...gameState,
          hasActiveGame: true,
          existingGame: false,
        });
      } catch (err) {
        socket.emit("error", { message: err.message });
      }
    });

    socket.on("disconnect", () => {
      console.log(`❌ User ${userId} disconnected from Tower`);
    });
  });
};

export default setupTowerSocket;
