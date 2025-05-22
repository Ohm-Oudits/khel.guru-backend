import { io } from "../../socket.js";
import service from "./keno.service.js";
import jwt from "jsonwebtoken";

const setupKenoSocket = () => {
  const kenoNamespace = io.of("/keno");

  kenoNamespace.use((socket, next) => {
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

  kenoNamespace.on("connection", (socket) => {
    const userId = socket.data.userId;
    console.log(`User ${userId} joined keno`);

    socket.join(`keno:${userId}`);

    socket.on("add_game", async ({ checkedBoxes, bet, risk }) => {
      console.log(`Received add_game from user ${userId}:`, {
        checkedBoxes,
        bet,
        risk,
      });
      try {
        if (
          !Array.isArray(checkedBoxes) ||
          checkedBoxes.length < 1 ||
          checkedBoxes.length > 10 ||
          checkedBoxes.some(
            (num) => !Number.isInteger(num) || num < 0 || num > 39
          )
        ) {
          console.log("Invalid checkedBoxes:", checkedBoxes);
          return socket.emit("error", { message: "Invalid Selected Numbers" });
        }

        if (
          typeof bet !== "string" ||
          isNaN(parseFloat(bet)) ||
          parseFloat(bet) < 0.000001
        ) {
          console.log("Invalid bet value:", bet, "Parsed:", parseFloat(bet));
          return socket.emit("error", {
            message: "Bet amount must be at least 0.000001",
          });
        }

        const result = await service.playGame(userId, checkedBoxes, bet, risk);
        console.log(`Emitting game_result to user ${userId}:`, result);
        socket.emit("game_result", result);
      } catch (err) {
        console.error(
          `Error processing add_game for user ${userId}:`,
          err.message
        );
        socket.emit("error", {
          message: err.message || "Failed to process game",
        });
      }
    });

    socket.on("disconnect", () => {
      console.log(`❌ User ${userId} disconnected from Keno`);
    });
  });
};

export default setupKenoSocket;
