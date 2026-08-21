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

      socket.data.userId = String(decoded.id);
      next();
    } catch (err) {
      console.error("Token verification failed:", err.message);
      return next(new Error("Invalid token"));
    }
  });

  parachuteNamespace.on("connection", (socket) => {
    const userId = socket.data.userId;
    socket.join(`parachute:${userId}`);

    const sendHistory = () => {
      socket.emit("round_history", { history: service.getHistory(userId) });
    };

    sendHistory();

    socket.on("get_history", sendHistory);

    const clearEmitInterval = () => {
      if (socket.data.emitInterval) {
        clearInterval(socket.data.emitInterval);
        socket.data.emitInterval = null;
      }
    };

    const deliverCrash = (multiplier, history) => {
      if (socket.data.roundCrashSent) return;
      socket.data.roundCrashSent = true;
      clearEmitInterval();
      socket.emit("game_crashed", {
        multiplier,
        isCrashed: true,
        history: history || service.getHistory(userId),
      });
    };

    const startStateEmitter = () => {
      clearEmitInterval();

      let roundActive = true;
      let lastMultiplier = 1;

      socket.data.emitInterval = setInterval(() => {
        const currentState = parachuteGame.getGameState(userId);

        if (!currentState) {
          if (roundActive && !socket.data.roundCrashSent) {
            deliverCrash(lastMultiplier);
          } else {
            clearEmitInterval();
          }
          return;
        }

        lastMultiplier = currentState.multiplier;

        socket.emit("game_state", {
          multiplier: currentState.multiplier,
          isCrashed: currentState.isCrashed,
          hasCheckedOut: currentState.hasCheckedOut,
        });

        if (currentState.isCrashed) {
          deliverCrash(currentState.multiplier);
        } else if (currentState.hasCheckedOut) {
          roundActive = false;
          clearEmitInterval();
        }
      }, 100);
    };

    socket.on("add_game", async (data) => {
      try {
        const { betAmount, difficulty, walletType } = data;
        if (
          betAmount == null ||
          Number.isNaN(Number(betAmount)) ||
          Number(betAmount) < 0 ||
          !difficulty
        ) {
          socket.emit("error", { message: "Missing required parameters" });
          return;
        }

        socket.data.roundCrashSent = false;

        const result = await service.join(
          userId,
          betAmount,
          difficulty,
          walletType,
          (payload) => deliverCrash(payload.multiplier, payload.history)
        );
        if (result.error) {
          socket.emit("error", { message: result.error });
          return;
        }

        if (parachuteGame.getGameState(userId)) {
          startStateEmitter();
        }

        socket.emit("game_started", {
          betAmount: result.gameState.betAmount,
          difficulty: result.gameState.difficulty,
          multiplier: result.gameState.multiplier,
          isCrashed: result.gameState.isCrashed,
          hasCheckedOut: result.gameState.hasCheckedOut,
          walletType: result.gameState.walletType,
          newBalance: result.newBalance,
        });
      } catch (err) {
        console.error("Error in add_game:", err.message);
        socket.emit("error", { message: err.message });
      }
    });

    socket.on("checkout", async () => {
      try {
        clearEmitInterval();
        socket.data.roundCrashSent = true;

        const result = await service.checkout(userId);
        if (result.error) {
          socket.emit("error", { message: result.error });
          return;
        }

        socket.emit("checkout_success", {
          multiplier: result.multiplier,
          crashPoint: result.crashPoint,
          winAmount: result.winAmount,
          newBalance: result.newBalance,
          hasCheckedOut: true,
          history: result.history,
        });
        socket.emit("round_history", { history: result.history });
      } catch (error) {
        console.error("Error in checkout:", error.message);
        socket.emit("error", { message: error.message });
      }
    });

    socket.on("disconnect", () => {
      clearEmitInterval();

      const gameState = parachuteGame.getGameState(userId);
      if (gameState && !gameState.hasCheckedOut && !gameState.isCrashed) {
        service.forfeit(userId).catch(console.error);
      }

      console.log(`❌ User ${userId} disconnected from Parachute`);
    });
  });
};

export default setupParachuteSocket;
