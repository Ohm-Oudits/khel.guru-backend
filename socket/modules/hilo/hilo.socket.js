import { io } from "../../socket.js";
import service from "./hilo.service.js";
import jwt from "jsonwebtoken";

const setupHiloSocket = () => {
  const hiloNamespace = io.of("/hilo");

  hiloNamespace.use((socket, next) => {
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

  hiloNamespace.on("connection", (socket) => {
    const userId = socket.data.userId;
    console.log(`User ${userId} joined hilo`);

    socket.join(`hilo:${userId}`);

    socket.on("get_active_game", async () => {
      try {
        const result = await service.getActiveGame(userId);
        socket.emit("active_game", {
          game: result.success ? result.game : null,
        });
      } catch (err) {
        socket.emit("active_game", { game: null });
      }
    });

    socket.on("shuffle_preview", async () => {
      try {
        const result = await service.shufflePreview(userId);
        if (result.success) {
          socket.emit("preview_state", { game: result.game });
        } else {
          socket.emit("preview_state", { error: result.error });
        }
      } catch (err) {
        socket.emit("preview_state", { error: err.message });
      }
    });

    socket.on("add_game", async (data) => {
      try {
        const { betAmount, walletType } = data;
        // Allow a 0 stake (testing); reject only a missing/NaN amount. A
        // negative amount is still rejected downstream by the wallet debit.
        if (betAmount == null || Number.isNaN(Number(betAmount))) {
          throw new Error("Missing bet amount");
        }

        const result = await service.join(userId, betAmount, walletType);
        if (result.success) {
          socket.emit("game_state", {
            ...result.game,
            hasActiveGame: result.hasActiveGame,
            message: result.message,
            newBalance: result.newBalance,
            walletType: result.walletType,
          });
        } else {
          socket.emit("error", { message: result.error });
        }
      } catch (err) {
        socket.emit("error", { message: err.message });
      }
    });

    socket.on("predict", async (data) => {
      try {
        const { prediction } = data;
        if (!prediction || !["high", "low"].includes(prediction)) {
          throw new Error("Invalid prediction");
        }

        const result = await service.predict(userId, prediction);
        if (result.success) {
          socket.emit("game_state", result.game);
          if (!result.isCorrect) {
            socket.emit("game_over", { game: result.game });
          }
        } else {
          socket.emit("error", { message: result.error });
        }
      } catch (err) {
        socket.emit("error", { message: err.message });
      }
    });

    socket.on("skip", async () => {
      try {
        const result = await service.skip(userId);
        if (result.success) {
          socket.emit("game_state", result.game);
        } else {
          socket.emit("error", { message: result.error });
        }
      } catch (err) {
        socket.emit("error", { message: err.message });
      }
    });

    socket.on("checkout", async () => {
      try {
        const result = await service.checkout(userId);
        if (result.success) {
          socket.emit("game_state", {
            checkedOut: true,
            profit: result.profit,
            multiplier: result.multiplier,
            newBalance: result.newBalance,
            walletType: result.walletType,
            fairness: result.fairness,
          });
        } else {
          socket.emit("error", { message: result.error });
        }
      } catch (err) {
        socket.emit("error", { message: err.message });
      }
    });

    socket.on("disconnect", () => {
      console.log(`❌ User ${userId} disconnected from Hilo`);
    });
  });
};

export default setupHiloSocket;
