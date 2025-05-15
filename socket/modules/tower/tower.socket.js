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

      socket.data.userId = decoded.id;
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

    // Get initial game state
    socket.on("get_game_state", async () => {
      try {
        const gameState = await service.getGameState(userId);
        socket.emit("game_state", gameState);
      } catch (err) {
        socket.emit("error", { message: err.message });
      }
    });

    // Start new game
    socket.on("add_game", async (data) => {
      try {
        const { betAmount, difficulty } = data;
        const gameState = await service.startGame(
          userId,
          betAmount,
          difficulty
        );
        socket.emit("game_state", gameState);
      } catch (err) {
        socket.emit("error", { message: err.message });
      }
    });

    // Reveal box
    socket.on("reveal", async (data) => {
      try {
        const { index } = data;
        const gameState = await service.revealBox(userId, index);
        socket.emit("game_state", gameState);
      } catch (err) {
        socket.emit("error", { message: err.message });
      }
    });

    // Checkout game
    socket.on("checkout", async () => {
      try {
        const gameState = await service.checkout(userId);
        socket.emit("game_state", gameState);
      } catch (err) {
        socket.emit("error", { message: err.message });
      }
    });

    // Continue game
    socket.on("continue_game", async () => {
      try {
        const gameState = await service.continueGame(userId);
        socket.emit("game_state", gameState);
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
