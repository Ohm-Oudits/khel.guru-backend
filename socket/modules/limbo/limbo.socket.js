import { io } from "../../socket.js";
import service from "./limbo.service.js";
import jwt from "jsonwebtoken";

const setupLimboSocket = () => {
  const limboNamespace = io.of("/limbo");

  limboNamespace.use((socket, next) => {
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

  limboNamespace.on("connection", (socket) => {
    const userId = socket.data.userId;
    console.log(`User ${userId} joined limbo`);

    socket.join(`limbo:${userId}`);

    // Join game
    socket.on("join_game", async () => {
      try {
        const result = await service.join(userId);
        if (result.error) {
          socket.emit("error", { message: result.error });
        } else {
          socket.emit("game_joined");
        }
      } catch (err) {
        socket.emit("error", { message: err.message });
      }
    });

    // Place bet
    socket.on("place_bet", async (data) => {
      try {
        const { betAmount, targetMultiplier, walletType } = data;

        if (
          betAmount == null ||
          Number.isNaN(Number(betAmount)) ||
          !targetMultiplier
        ) {
          socket.emit("error", { message: "Missing bet parameters" });
          return;
        }

        const result = await service.placeBet(
          userId,
          betAmount,
          targetMultiplier,
          walletType
        );

        if (result.error) {
          socket.emit("error", { message: result.error });
        } else {
          socket.emit("bet_result", result.result);
        }
      } catch (err) {
        socket.emit("error", { message: err.message });
      }
    });

    socket.on("disconnect", () => {
      console.log(`❌ User ${userId} disconnected from Limbo`);
    });
  });
};

export default setupLimboSocket;
