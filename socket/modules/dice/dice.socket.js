import { io } from "../../socket.js";
import service from "./dice.service.js";
import jwt from "jsonwebtoken";

const setupDiceSocket = () => {
  const diceNamespace = io.of("/dice");

  diceNamespace.use((socket, next) => {
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

  diceNamespace.on("connection", (socket) => {
    const userId = socket.data.userId;
    console.log(`User ${userId} joined dice`);

    socket.join(`dice:${userId}`);

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

    // Roll dice
    socket.on("roll_dice", async (data) => {
      try {
        console.log("roll");
        const { betAmount, prediction, rollUnder, walletType } = data;

        if (
          betAmount == null ||
          Number.isNaN(Number(betAmount)) ||
          !prediction ||
          typeof rollUnder === "undefined"
        ) {
          socket.emit("error", { message: "Missing required parameters" });
          return;
        }

        const result = await service.rollDice(
          userId,
          betAmount,
          prediction,
          rollUnder,
          walletType
        );
        if (result.error) {
          socket.emit("error", { message: result.error });
          return;
        }

        // Emit to specific user room
        diceNamespace.to(`dice:${userId}`).emit("dice_result", result.result);

        diceNamespace.emit("dice_update", {
          userId,
          diceRoll: result.result.diceRoll,
          prediction: result.result.prediction,
          isWin: result.result.isWin,
          multiplier: result.result.multiplier,
          timestamp: new Date(),
        });
      } catch (err) {
        console.error("Error in roll_dice:", err);
        socket.emit("error", { message: err.message });
      }
    });

    socket.on("disconnect", () => {
      console.log(`❌ User ${userId} disconnected from Dice`);
    });
  });
};

export default setupDiceSocket;
