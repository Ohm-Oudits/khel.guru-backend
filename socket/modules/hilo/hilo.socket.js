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
        if (result.success) {
          socket.emit("game_state", result.game);
        }
      } catch (err) {
        socket.emit("error", { message: "Connection error" });
      }
    });

    socket.on("add_game", async (data) => {
      try {
        const { betAmount } = data;
        if (!betAmount) {
          throw new Error("Missing bet amount");
        }

        const result = await service.join(userId, betAmount);
        if (result.success) {
          socket.emit("game_state", {
            ...result.game,
            hasActiveGame: result.hasActiveGame,
            message: result.message,
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
