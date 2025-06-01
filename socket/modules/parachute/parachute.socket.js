import { io } from "../../socket.js";
import service from "./parachute.service.js";
import jwt from "jsonwebtoken";
import parachuteGame from "./parachute.game.js";

const setupParachuteSocket = () => {
  const parachuteNamespace = io.of("/parachute");

  parachuteNamespace.use((socket, next) => {
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

  parachuteNamespace.on("connection", (socket) => {
    const userId = socket.data.userId;
    socket.join(`parachute:${userId}`);

    // Start game
    socket.on("add_game", async (data) => {
      try {
        const { betAmount, difficulty } = data;
        if (!betAmount || !difficulty) {
          socket.emit("error", { message: "Missing required parameters" });
          return;
        }

        const result = await service.join(userId, betAmount, difficulty);
        if (result.error) {
          socket.emit("error", { message: result.error });
          return;
        }

        // Start emitting game state updates
        const gameState = parachuteGame.getGameState(userId);
        if (gameState) {
          const emitInterval = setInterval(() => {
            const currentState = parachuteGame.getGameState(userId);
            if (!currentState) {
              clearInterval(emitInterval);
              return;
            }
            socket.emit("game_state", {
              multiplier: currentState.multiplier,
              isCrashed: currentState.isCrashed,
              hasCheckedOut: currentState.hasCheckedOut,
            });
          }, 100); // Emit updates every 100ms

          // Store interval ID in socket for cleanup
          socket.data.emitInterval = emitInterval;
        }

        socket.emit("game_started", result.gameState);
      } catch (err) {
        console.error("Error in add_game:", err.message);
        socket.emit("error", { message: err.message });
      }
    });

    // Handle crash
    socket.on("crash", async (data) => {
      try {
        const result = await service.handleCrash(userId);
        if (result.error) {
          socket.emit("error", { message: result.error });
          return;
        }

        socket.emit("game_crashed", {
          multiplier: result.multiplier,
          isCrashed: true,
        });
      } catch (error) {
        console.error("Error in crash:", error.message);
        socket.emit("error", { message: error.message });
      }
    });

    // Handle checkout
    socket.on("checkout", async (data) => {
      try {
        const result = await service.checkout(userId);
        if (result.error) {
          socket.emit("error", { message: result.error });
          return;
        }

        socket.emit("checkout_success", {
          multiplier: result.multiplier,
          winAmount: result.winAmount,
          hasCheckedOut: true,
        });
      } catch (error) {
        console.error("Error in checkout:", error.message);
        socket.emit("error", { message: error.message });
      }
    });

    // Cleanup on disconnect
    socket.on("disconnect", () => {
      if (socket.data.emitInterval) {
        clearInterval(socket.data.emitInterval);
      }

      // Handle any active game
      const gameState = parachuteGame.getGameState(userId);
      if (gameState && !gameState.hasCheckedOut) {
        service.handleCrash(userId).catch(console.error);
      }

      console.log(`❌ User ${userId} disconnected from Parachute`);
    });
  });
};

export default setupParachuteSocket;
