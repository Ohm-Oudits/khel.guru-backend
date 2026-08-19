import { io } from "../../socket.js";
import service from "./crash.service.js";
import jwt from "jsonwebtoken";

const setupCrashSocket = () => {
  const crashNamespace = io.of("/crash");

  crashNamespace.use((socket, next) => {
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

  crashNamespace.on("connection", (socket) => {
    const userId = socket.data.userId;
    console.log(`User ${userId} joined crash`);

    socket.join(`crash:${userId}`);

    socket.on("add_game", async (data) => {
      try {
        await service.join(userId);
      } catch (err) {
        socket.emit("error", { message: err.message });
      }
    });

    // Stake commitment: debit once, or reject the bet.
    socket.on("place_bet", async (data) => {
      try {
        const { betAmount, walletType } = data || {};
        if (!betAmount || Number(betAmount) <= 0) {
          socket.emit("error", { message: "Invalid bet amount" });
          return;
        }

        const result = await service.placeBet(userId, betAmount, walletType);
        if (result.error) {
          socket.emit("error", { message: result.error });
          return;
        }

        socket.emit("bet_placed", {
          betAmount: result.betAmount,
          newBalance: result.newBalance,
          walletType: result.walletType,
        });
      } catch (err) {
        console.error("Error in crash place_bet:", err);
        socket.emit("error", { message: err.message });
      }
    });

    // Cashout: credit stake x multiplier once for the active bet.
    socket.on("cash_out", async (data) => {
      try {
        const { multiplier } = data || {};
        const result = await service.cashOut(userId, multiplier);
        if (result.error) {
          socket.emit("error", { message: result.error });
          return;
        }

        socket.emit("cashout_success", {
          multiplier: result.multiplier,
          payout: result.payout,
          newBalance: result.newBalance,
          walletType: result.walletType,
        });
      } catch (err) {
        console.error("Error in crash cash_out:", err);
        socket.emit("error", { message: err.message });
      }
    });

    // Bust: the round crashed before a cashout; the stake stays debited.
    socket.on("bust", async () => {
      try {
        const result = await service.bust(userId);
        socket.emit("bet_busted", {
          newBalance: result.newBalance ?? null,
        });
      } catch (err) {
        console.error("Error in crash bust:", err);
        socket.emit("error", { message: err.message });
      }
    });

    socket.on("disconnect", () => {
      // An unsettled bet is forfeited (bust semantics) on disconnect.
      service.clearBet(userId);
      console.log(`❌ User ${userId} disconnected from Wheel`);
    });
  });
};

export default setupCrashSocket;
