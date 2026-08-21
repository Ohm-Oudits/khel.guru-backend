import { io } from "../../socket.js";
import service, { startGameLoop } from "./crash.service.js";
import jwt from "jsonwebtoken";

const setupCrashSocket = () => {
  const crashNamespace = io.of("/crash");

  crashNamespace.use((socket, next) => {
    const token = socket.handshake.auth?.token;

    if (!token) {
      socket.data.userId = null;
      return next();
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
    console.log(
      userId ? `User ${userId} joined crash` : "Guest joined crash as spectator"
    );

    if (userId) {
      socket.join(`crash:${userId}`);
    }
    startGameLoop();
    socket.emit("round_state", service.getSnapshot());

    socket.on("add_game", async () => {
      if (!userId) return;
      try {
        await service.join(userId);
      } catch (err) {
        socket.emit("error", { message: err.message });
      }
    });

    socket.on("get_state", () => {
      socket.emit("round_state", service.getSnapshot());
    });

    // Stake commitment: debit once, or reject the bet.
    socket.on("place_bet", async (data) => {
      try {
        if (!userId) {
          socket.emit("error", { message: "Login required to bet" });
          return;
        }
        const { betAmount, walletType, autoCashoutAt } = data || {};
        if (
          betAmount == null ||
          Number.isNaN(Number(betAmount)) ||
          Number(betAmount) < 0
        ) {
          socket.emit("error", { message: "Invalid bet amount" });
          return;
        }

        const result = await service.placeBet(
          userId,
          betAmount,
          walletType,
          autoCashoutAt
        );
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
        if (!userId) {
          socket.emit("error", { message: "Login required to cash out" });
          return;
        }
        const result = await service.cashOut(userId, {
          atMultiplier: data?.multiplier,
        });
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
      // Keep the round bet so a reconnect can still cash out, and the
      // house loop can bust it if the round ends first.
      console.log(`❌ User ${userId} disconnected from Crash`);
    });
  });

  startGameLoop();
};

export default setupCrashSocket;
