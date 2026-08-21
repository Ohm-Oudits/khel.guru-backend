import { io } from "../../socket.js";
import service from "./twist.service.js";
import jwt from "jsonwebtoken";

const setupTwistSocket = () => {
  const twistNamespace = io.of("/twist");

  twistNamespace.use((socket, next) => {
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

  twistNamespace.on("connection", (socket) => {
    const userId = socket.data.userId;
    socket.join(`twist:${userId}`);

    socket.on("add_game", async () => {
      try {
        await service.join(userId);
      } catch (err) {
        socket.emit("error", { message: err.message });
      }
    });

    socket.on("get_state", async () => {
      try {
        const state = await service.getState(userId);
        socket.emit("twist_state", state);
      } catch (err) {
        socket.emit("error", { message: err.message });
      }
    });

    socket.on("place_bet", async (data) => {
      try {
        const { betAmount, walletType } = data || {};

        if (
          betAmount == null ||
          Number.isNaN(Number(betAmount)) ||
          Number(betAmount) <= 0
        ) {
          socket.emit("error", { message: "Missing bet amount" });
          return;
        }

        const result = await service.placeBet(userId, betAmount, walletType);
        if (result.error) {
          socket.emit("error", { message: result.error });
          return;
        }

        socket.emit("bet_result", result.result);
      } catch (err) {
        socket.emit("error", { message: err.message });
      }
    });

    socket.on("cashout", async () => {
      try {
        const result = await service.cashout(userId);
        if (result.error) {
          socket.emit("error", { message: result.error });
          return;
        }
        socket.emit("cashout_result", result.result);
      } catch (err) {
        socket.emit("error", { message: err.message });
      }
    });

    socket.on("partial_cashout", async () => {
      try {
        const result = await service.partialCashout(userId);
        if (result.error) {
          socket.emit("error", { message: result.error });
          return;
        }
        socket.emit("partial_cashout_result", result.result);
      } catch (err) {
        socket.emit("error", { message: err.message });
      }
    });

    socket.on("disconnect", () => {
      console.log(`User ${userId} disconnected from Twist`);
    });
  });
};

export default setupTwistSocket;
