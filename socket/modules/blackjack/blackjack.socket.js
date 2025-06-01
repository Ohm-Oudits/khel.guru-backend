import { io } from "../../socket.js";
import service from "./blackjack.service.js";
import jwt from "jsonwebtoken";

const setupBlackjackSocket = () => {
  const blackjackNamespace = io.of("/blackjack");

  blackjackNamespace.use((socket, next) => {
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

  blackjackNamespace.on("connection", (socket) => {
    const userId = socket.data.userId;
    console.log(`User ${userId} joined blackjack`);

    socket.join(`blackjack:${userId}`);

    // Send initial game state on connection
    const sendInitialGameState = async () => {
      try {
        const result = await service.getGameState(userId);
        if (result.success) {
          socket.emit("game_state", result);
        }
      } catch (error) {
        console.log("No active game found for user:", userId);
      }
    };

    // Send initial game state
    sendInitialGameState();

    // Join game
    socket.on("add_game", async (data) => {
      try {
        const result = await service.join(userId);
        console.log(result);
        socket.emit("game_state", result);
      } catch (err) {
        console.error("Add game error:", err);
        socket.emit("error", { message: err.message });
      }
    });

    // Place bet
    socket.on("place_bet", async ({ betAmount }) => {
      try {
        const result = await service.placeBet(userId, parseFloat(betAmount));
        if (result.success) {
          // Emit game state update
          socket.emit("game_state", result);

          // If game is in playing state, also emit a specific event
          if (result.gameState.gameState === "playing") {
            socket.emit("game_started", { betAmount: result.gameState.bet });
          }
        }
      } catch (err) {
        console.error("Place bet error:", err);
        socket.emit("error", { message: err.message });
      }
    });

    // Hit
    socket.on("hit", async () => {
      try {
        const result = await service.hit(userId);
        socket.emit("game_state", result);
      } catch (err) {
        console.error("Hit error:", err);
        socket.emit("error", { message: err.message });
      }
    });

    // Stand
    socket.on("stand", async () => {
      try {
        const result = await service.stand(userId);
        socket.emit("game_state", result);
        if (result.winnings > 0) {
          socket.emit("win", { amount: result.winnings });
        }
      } catch (err) {
        console.error("Stand error:", err);
        socket.emit("error", { message: err.message });
      }
    });

    // Split
    socket.on("split", async () => {
      try {
        const result = await service.split(userId);
        socket.emit("game_state", result);
      } catch (err) {
        console.error("Split error:", err);
        socket.emit("error", { message: err.message });
      }
    });

    // Double
    socket.on("double", async () => {
      try {
        const result = await service.double(userId);
        socket.emit("game_state", result);
        if (result.winnings > 0) {
          socket.emit("win", { amount: result.winnings });
        }
      } catch (err) {
        console.error("Double error:", err);
        socket.emit("error", { message: err.message });
      }
    });

    // Get current game state
    socket.on("get_game_state", async () => {
      try {
        const result = await service.getGameState(userId);
        if (result.success) {
          socket.emit("initial_game_state", result);
        } else {
          socket.emit("error", { message: "Failed to get game state" });
        }
      } catch (err) {
        console.error("Get game state error:", err);
        socket.emit("error", { message: err.message });
      }
    });

    // Regular game state updates (for ongoing game actions)
    socket.on("game_state", async () => {
      try {
        const result = await service.getGameState(userId);
        if (result.success) {
          socket.emit("game_state_update", result);
        }
      } catch (err) {
        console.error("Get game state error:", err);
        socket.emit("error", { message: err.message });
      }
    });

    socket.on("disconnect", () => {
      console.log(`❌ User ${userId} disconnected from Blackjack`);
    });
  });
};

export default setupBlackjackSocket;
